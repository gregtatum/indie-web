import { T } from 'src';
import { UnhandledCaseError } from '../utils';

type Message = { type: 'initialize' };

function handleMessage(message: Message) {
  const { type } = message;
  switch (type) {
    case 'initialize':
      console.log(`!!! Initialized.`);
      return null;
    default:
      throw new UnhandledCaseError(type, `Unknown message ${type}.`);
  }
}

(self as any as T.SharedWorkerGlobalScope).onconnect = ({ ports: [port] }) => {
  port.addEventListener('message', ({ data }) => {
    handleMessage(data);
  });
  port.start();
};
