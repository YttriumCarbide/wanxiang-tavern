import { parentPort, workerData } from 'node:worker_threads';
import { runStressMatrixSerial } from './stress.mjs';

parentPort.postMessage(runStressMatrixSerial(workerData));
