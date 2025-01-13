import { NodeRedApp, EditorNodeProperties } from 'node-red'
import { NODE_STATUS } from '../constants'
import { AmqpInNodeDefaults, AmqpOutNodeDefaults, ErrorType, NodeType, ErrorLocationEnum } from '../types'
import Amqp from '../Amqp'
import { Channel, Connection } from 'amqplib'

module.exports = function (RED: NodeRedApp): void {
  function AmqpIn(config: EditorNodeProperties & {
    clientName: string
  }): void {
    let reconnectTimeout: NodeJS.Timeout
    let reconnect: () => Promise<void> = null;
    let connection: Connection = null;
    let channel: Channel = null;
    let connectionNumber: number = 0;

    RED.events.once('flows:stopped', () => {
      clearTimeout(reconnectTimeout)
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    RED.nodes.createNode(this, config)
    this.status(NODE_STATUS.Disconnected(`Connections: ${connectionNumber}`))
    

    const configAmqp: AmqpInNodeDefaults & AmqpOutNodeDefaults = config;

    const amqp = new Amqp(RED, this, configAmqp)

    const reconnectOnError = configAmqp.reconnectOnError;

    const inputListener = async (msg, _, done) => {
      if (msg.payload && msg.payload.reconnectCall && typeof reconnect === 'function') {
        await reconnect()
        done && done()
      } else {
        done && done()
      }
    }

    // receive input reconnectCall
    this.on('input', inputListener)
    // When the node is re-deployed
    this.on('close', async (done: () => void): Promise<void> => {
      await amqp.close()
      done && done()
    })
    

    async function initializeNode(nodeIns) {
      reconnect = async () => {
        // check the channel and clear all the event listener
        if (channel && channel.removeAllListeners) {
          channel.removeAllListeners()
          channel.close();
          channel = null;
        }

        // always clear timer before set it;
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          try {
            initializeNode(nodeIns)
          } catch (e) {
            reconnect()
          }
        }, 2000)
      }

      try {
        connection = await amqp.connect()
        
        // istanbul ignore else
        if (connection) {
          connectionNumber++;
          channel = await amqp.initialize()
          await amqp.consume()

          // When the connection goes down
          connection.on('close', async e => {
            connectionNumber--;
            e && (await reconnect())
          })

          // When the connection goes down
          connection.on('error', async e => {
            connectionNumber--;
            reconnectOnError && (await reconnect())
            nodeIns.error(`Connection error ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectionErrorEvent } })           
          })

          // When the channel goes down
          channel.on('close', async () => {
            await reconnect()
          })

          // When the channel goes down
          channel.on('error', async (e) => {
            reconnectOnError && (await reconnect())
            nodeIns.error(`Channel error ${e}`, { payload: { error: e, location: ErrorLocationEnum.ChannelErrorEvent } })
          })
          
          nodeIns.status(NODE_STATUS.Connected(`Connections: ${connectionNumber}`))
        }
      } 
      catch (e) {
        connectionNumber--;
        reconnectOnError && (await reconnect())
        if (e.code === ErrorType.InvalidLogin) {
          nodeIns.status(NODE_STATUS.Invalid)
          nodeIns.error(`AmqpIn() Could not connect to broker ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectError } })
        } 
        else {
          nodeIns.status(NODE_STATUS.Error)
          nodeIns.error(`AmqpIn() ${e}`, { payload: { error: e, source: 'ConnectionError' } })
        }
      }
    }

    // call
    initializeNode(this);
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  RED.nodes.registerType(NodeType.AmqpIn, AmqpIn)
}
