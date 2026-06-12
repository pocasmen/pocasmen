import { EventEmitter } from 'events';

class AppEventEmitter extends EventEmitter {}

export const eventEmitter = new AppEventEmitter();
