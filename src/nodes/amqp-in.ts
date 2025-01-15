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
    
    /**
     * Clears the AMQP channel and connection by removing all listeners and closing them.
     * 
     * This function performs the following steps:
     * 1. If the `channel` exists and has a `removeAllListeners` method, it removes all listeners, closes the channel, and sets it to `null`.
     * 2. If the `connection` exists and has a `removeAllListeners` method, it removes all listeners, closes the connection, and sets it to `null`.
     * 
     * @async
     * @function clearChannelAndConnection
     * @returns {Promise<void>} A promise that resolves when the channel and connection are cleared.
     */
    async function clearChannelAndConnection() {
      
      RED.log.debug(`Clearing channel and connection`)

      if (channel && channel.removeAllListeners) {
        channel.removeAllListeners()
        channel.close();
        channel = null;
      }

      if (connection && connection.removeAllListeners) {
        connection.removeAllListeners()
        connection.close();
        connection = null;
      }

    }

    /**
     * Handles the reconnection logic for a given node instance.
     * 
     * @param nodeIns - The node instance that requires reconnection handling.
     * @param e - The error object that triggered the reconnection attempt.
     * 
     * @returns A promise that resolves when the reconnection attempt is complete.
     * 
     * @throws Will throw an error if the reconnection attempt fails.
     */
    async function handleReconnect(nodeIns, e) {
      RED.log.debug(`Reconnecting...`)
      
      try{
        nodeIns.status(NODE_STATUS.Reconnecting("Reconnecting..."))
        e && reconnectOnError && (await reconnect())
      }
      catch(e){
        nodeIns.error(`Error while reconnecting, details: ${e}`)
      }
    }

    async function initializeNode(nodeIns) {
      reconnect = async () => {
        
        await clearChannelAndConnection()

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
            RED.log.info(`Connection closed...`)
            connectionNumber--;
            await handleReconnect(nodeIns, e)
          })

          // When the connection goes down
          connection.on('error', async e => {
            connectionNumber--;
            RED.log.error(`Connection error details: ${e}`)
            nodeIns.status(NODE_STATUS.Error(`Connection error. Reconnecting...`))           
            await handleReconnect(nodeIns, e)
          })

          // When the channel goes down
          channel.on('close', async () => {
            RED.log.debug(`Channel closed`)
            await handleReconnect(nodeIns, null)
          })

          // When the channel goes down
          channel.on('error', async (e) => {
            RED.log.error(`Channel error, details: ${e}`)
            nodeIns.status(NODE_STATUS.Error(`Channel error. Reconnecting...`))
            await handleReconnect(nodeIns, e)
          })
          
          nodeIns.status(NODE_STATUS.Connected(`Connections: ${connectionNumber}`))
        }
      } 
      catch (e) {
        connectionNumber--;
        reconnectOnError && (await reconnect())
        if (e.code === ErrorType.InvalidLogin) {
          RED.log.error(`Could not connect to broker, details: ${e}`)
          nodeIns.status(NODE_STATUS.Invalid)
        } 
        else {
          RED.log.error(`AmqpIn error ${e}`)
          nodeIns.status(NODE_STATUS.Error(e))
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
