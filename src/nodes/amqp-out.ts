import { NodeRedApp, EditorNodeProperties } from 'node-red'
import { NODE_STATUS } from '../constants'
import { AmqpInNodeDefaults, AmqpOutNodeDefaults, ErrorLocationEnum, ErrorType, NodeType } from '../types'
import Amqp from '../Amqp'
import { MessageProperties } from 'amqplib'

module.exports = function (RED: NodeRedApp): void {
  function AmqpOut(
    config: EditorNodeProperties & {
      exchangeRoutingKey: string
      exchangeRoutingKeyType: string
      amqpProperties: string
    },
  ): void {
    let reconnectTimeout: NodeJS.Timeout
    let reconnect = null;
    let connection = null;
    let channel = null;

    RED.events.once('flows:stopped', () => {
      clearTimeout(reconnectTimeout)
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    RED.nodes.createNode(this, config)
    this.status(NODE_STATUS.Disconnected)

    const configAmqp: AmqpInNodeDefaults & AmqpOutNodeDefaults = config;

    const amqp = new Amqp(RED, this, configAmqp)

    const reconnectOnError = configAmqp.reconnectOnError;

    const reconnectTimeoutValue = configAmqp.reconnectTimeoutValue

    // handle input event;
    const inputListener = async (msg, _, done) => {
      const { payload, routingKey, properties: msgProperties } = msg
      const {
        exchangeRoutingKey,
        exchangeRoutingKeyType,
        amqpProperties,
      } = config

      // message properties override config properties
      let properties: MessageProperties
      try {
        properties = {
          ...JSON.parse(amqpProperties),
          ...msgProperties,
        }
      } catch (e) {
        properties = msgProperties
      }

      switch (exchangeRoutingKeyType) {
        case 'msg':
        case 'flow':
        case 'global':
          amqp.setRoutingKey(
            RED.util.evaluateNodeProperty(
              exchangeRoutingKey,
              exchangeRoutingKeyType,
              this,
              msg,
            ),
          )
          break
        case 'jsonata':
          amqp.setRoutingKey(
            RED.util.evaluateJSONataExpression(
              RED.util.prepareJSONataExpression(exchangeRoutingKey, this),
              msg,
            ),
          )
          break
        case 'str':
        default:
          if (routingKey) {
            // if incoming payload contains a routingKey value
            // override our string value with it.

            // Superfluous (and possibly confusing) at this point
            // but keeping it to retain backwards compatibility
            amqp.setRoutingKey(routingKey)
          }
          break
      }

      try {
        //Execute publish only 
        const conn = await amqp.connect()
        console.log(conn)
        if (conn) {
          if (!!properties?.headers?.doNotStringifyPayload) {
            await amqp.publish(payload, properties)
          } else {
            await amqp.publish(JSON.stringify(payload), properties)
          }
        } else {
          throw ("Connection not present, impossible to publish.")
        }
      } catch (e) {
        this.error(e, msg)
      }

      done && done()
    }

    this.on('input', inputListener)
    // When the node is re-deployed
    this.on('close', async (done: () => void): Promise<void> => {
      await amqp.close()
      done && done()
    })

    async function initializeNode(nodeIns) {
      reconnect = async () => {
        try {
          // check the channel and clear all the event listener
          if (channel && channel.removeAllListeners) {
            channel.removeAllListeners()
            await channel.close();
            channel = null;
          }

          // check the connection and clear all the event listener
          if (connection && connection.removeAllListeners) {
            connection.removeAllListeners()
            await connection.close();
            connection = null;
          }
        } catch (e) {
          //TODO
          // Find a way to obtain only one error when closing connection
        }


        // always clear timer before set it;
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          try {
            initializeNode(nodeIns)
          } catch (e) {
            reconnect()
          }
        }, reconnectTimeoutValue)
      }

      try {
        const connection = await amqp.connect()

        // istanbul ignore else
        if (connection) {
          try {
            channel = await amqp.initialize()
          } catch (e) {
            nodeIns.error(`Impossible to initialize channel: ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectionErrorEvent } })
          }

          // When the server goes down
          connection.on('close', async () => {   
            reconnectOnError && (await reconnect())     
            nodeIns.error(`Connection closed.`, { payload: { error: "Connection Closed", location: ErrorLocationEnum.ConnectionErrorEvent } })
          })

          // When the connection goes down
          connection.on('error', async e => {
            reconnectOnError && (await reconnect())
            nodeIns.error(`Connection error ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectionErrorEvent } })
          })

          // When the channel goes down
          channel.on('close', async () => {
            //await reconnect()
          })

          // When the channel error occur
          channel.on('error', async e => {
            reconnectOnError && (await reconnect())
            nodeIns.error(`Channel error ${e}`, { payload: { error: e, location: ErrorLocationEnum.ChannelErrorEvent } })
          })

          nodeIns.status(NODE_STATUS.Connected)
        }
      } catch (e) {
        reconnectOnError && (await reconnect())
        if (e.code === ErrorType.InvalidLogin) {
          nodeIns.status(NODE_STATUS.Invalid)
          console.log("NODEINS" + nodeIns.type)
          nodeIns.error(`AmqpOut() Could not connect to broker ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectError } })
        } else {
          nodeIns.status(NODE_STATUS.Error)
          nodeIns.error(`AmqpOut() ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectError } })
        }
      }
    }

    // call
    initializeNode(this);
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  RED.nodes.registerType(NodeType.AmqpOut, AmqpOut)
}
