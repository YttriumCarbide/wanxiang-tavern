import { parentPort, workerData } from 'node:worker_threads';
import { runCampaignMatrix } from './matrix.mjs';

parentPort.postMessage(runCampaignMatrix(workerData));
