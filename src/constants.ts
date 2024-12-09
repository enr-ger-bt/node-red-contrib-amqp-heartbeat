import { NodeStatus } from 'node-red';

export const NODE_STATUS: { [index: string]: (extraText?: string) => NodeStatus } = Object.freeze({
  Connected: (extraText = '') => ({
    fill: 'green',
    shape: 'dot',
    text: `Connected${extraText ? `: ${extraText}` : ''}`,
  }),
  Disconnected: (extraText = '') => ({
    fill: 'grey',
    shape: 'ring',
    text: `Disconnected${extraText ? `: ${extraText}` : ''}`,
  }),
  Error: (extraText = '') => ({
    fill: 'red',
    shape: 'dot',
    text: `Error${extraText ? `: ${extraText}` : ''}`,
  }),
  Invalid: (extraText = '') => ({
    fill: 'red',
    shape: 'ring',
    text: `Unable to connect${extraText ? `: ${extraText}` : ''}`,
  }),
  Reconnecting: (extraText = '') => ({
    fill: 'yellow',
    shape: 'ring',
    text: `Reconnecting${extraText ? `: ${extraText}` : ''}`,
  }),
});