import { NodeRedApp, EditorNodeProperties } from 'node-red'
import { NODE_STATUS } from '../constants'
import { AmqpInNodeDefaults, AmqpOutNodeDefaults, ErrorType, NodeType, ErrorLocationEnum } from '../types'
import Amqp from '../Amqp'
import { Channel, Connection } from 'amqplib'
import { clear } from 'console'

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

    /**
     * Asynchronous listener function for handling incoming messages.
     *
     * @param msg - The incoming message object. If `msg.payload.reconnectCall` is truthy and `reconnect` is a function, it triggers a reconnection.
     * @param _ - Unused parameter, typically representing metadata or context.
     * @param done - Optional callback to signal completion of message processing.
     *
     * @remarks
     * If the message payload contains a `reconnectCall` property and a `reconnect` function is available,
     * the function will await the reconnection before calling `done`. Otherwise, it simply calls `done`.
     */
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

    // remove input listener on close
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
      try {
        if (!channel && !connection) {
          RED.log.debug(`Channel and connection are already cleared`)
        }


        if (channel && channel.removeAllListeners) {
          channel.removeAllListeners();
          channel = null;
        }

        if (connection && connection.removeAllListeners) {
          connection.removeAllListeners()
          connection = null;
        }
      }
      catch (err) {
        if (err && err.name === 'IllegalOperationError' && err.message.includes('Channel closed')) {
          RED.log.warn(`Channel already closed, ignoring: ${err.message}`);
        } else {
          RED.log.error(`Error while closing channel: ${err.stack || err}`);
        }

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

      try {
        nodeIns.status(NODE_STATUS.Reconnecting("Reconnecting..."))
        e && reconnectOnError && (await reconnect())
      }
      catch (e) {
        nodeIns.error(`Error while reconnecting, details: ${e}`)
      }
    }

    /**
     * Ensures that the `connectionNumber` variable is not negative.
     * 
     * If `connectionNumber` is less than or equal to zero, it resets it to zero.
     * This function is used to maintain a valid, non-negative connection count.
     */
    function VerifyConnectionNumber() {
      if (connectionNumber <= 0) {
        connectionNumber = 0;
      }
    }

    /**
     * Initializes the AMQP node by establishing a connection and channel, setting up consumers,
     * and handling reconnection logic in case of errors or disconnections.
     *
     * This function manages the AMQP connection lifecycle, including:
     * - Attempting to connect and initialize the AMQP channel.
     * - Setting up event listeners for connection and channel errors or closures.
     * - Updating the node status based on connection state.
     * - Handling reconnection attempts with exponential backoff on failure.
     *
     * @param nodeIns - The Node-RED node instance to initialize and update status for.
     * @returns A Promise that resolves when the node is initialized or rejects on unrecoverable error.
     */
    async function initializeNode(nodeIns) {
      reconnect = async () => {
        try {
          await clearChannelAndConnection()
        }
        catch (err) {
          RED.log.error(`Error while clearing channel and connection: ${err.stack || err}`)
        }
        // always clear timer before set it;
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(async () => {
          try {
            initializeNode(nodeIns)
          } catch (e) {
            await reconnect()
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
            VerifyConnectionNumber();
            await handleReconnect(nodeIns, e)
          })

          // When the connection goes down
          connection.on('error', async e => {
            connectionNumber--;
            VerifyConnectionNumber();
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
        VerifyConnectionNumber();
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
