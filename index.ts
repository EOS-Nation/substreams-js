import EventEmitter from 'node:events';
import TypedEmitter from "typed-emitter";
import { credentials, Metadata } from '@grpc/grpc-js';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';

// Substream generated code
// $ buf generate buf.build/fubhy/substreams
import { StreamClient } from './src/generated/sf/substreams/v1/substreams.client';
import { Modules } from './src/generated/sf/substreams/v1/modules';
import { BlockScopedData, ForkStep, Request } from './src/generated/sf/substreams/v1/substreams';
import { StoreDeltas } from "./src/generated/sf/substreams/v1/substreams";
import { Any } from "./src/generated/google/protobuf/any";

// Export utils & Typescript interfaces
export * from "./src/generated/sf/substreams/v1/clock"
export * from "./src/generated/sf/substreams/v1/modules"
export * from "./src/generated/sf/substreams/v1/package"
export * from "./src/generated/sf/substreams/v1/substreams"
export * from "./src/utils";

// Utils
import { parseBlockData } from './src/utils';

interface ModuleOutput {
    name: string;
    logs: string[];
    logsTruncated: boolean;
}

interface MapOutput extends ModuleOutput {
    data: {
        oneofKind: "mapOutput";
        mapOutput: Any;
    }
}

interface StoreDelta extends ModuleOutput {
    data: {
        oneofKind: "storeDeltas";
        storeDeltas: StoreDeltas;
    }
}

type MessageEvents = {
    block: (block: BlockScopedData) => void;
    mapOutput: (output: MapOutput) => void;
    storeDeltas: (output: StoreDelta) => void;
    cursor: (cursor: string) => void;
}

export class Substreams extends (EventEmitter as new () => TypedEmitter<MessageEvents>) {
    // internal
    public client: StreamClient;

    // configs
    public startBlockNum?: string;
    public stopBlockNum?: string;
    public outputModules?: string[];
    public cursor?: string;
    public startCursor?: string;
    public irreversibilityCondition?: string;
    public forkSteps?: ForkStep[];
    public initialStoreSnapshotForModules?: string[];

    private stopped = false;

    constructor(host: string, options: {
        startBlockNum?: string,
        stopBlockNum?: string,
        outputModules?: string[],
        authorization?: string,
        startCursor?: string,
        forkSteps?: ForkStep[],
        irreversibilityCondition?: string;
        initialStoreSnapshotForModules?: string[],
    } = {}) {
        super();
        this.startBlockNum = options.startBlockNum;
        this.stopBlockNum = options.stopBlockNum;
        this.outputModules = options.outputModules;
        this.startCursor = options.startCursor;
        this.irreversibilityCondition = options.irreversibilityCondition;
        this.forkSteps = options.forkSteps ?? [ForkStep.STEP_IRREVERSIBLE];
        this.initialStoreSnapshotForModules = options.initialStoreSnapshotForModules;

        // Credentials
        const metadata = new Metadata();
        if ( options.authorization ) metadata.add('authorization', options.authorization);
        const creds = credentials.combineChannelCredentials(
            credentials.createSsl(),
            credentials.createFromMetadataGenerator((_, callback) => callback(null, metadata)),
        );
        
        // Substream Client
        this.client = new StreamClient(
            new GrpcTransport({
                host,
                channelCredentials: creds,
            }),
        );
    }

    public stop() {
        this.stopped = true;
    }

    public async start(modules: Modules) {    
        this.stopped = false;

        // Validate input
        if ( this.startBlockNum ) {
            const startBlockNum = Number(this.startBlockNum);
            if ( !Number.isInteger(startBlockNum)) throw new Error("startBlockNum must be an integer");
            if ( startBlockNum <= 0 ) throw new Error("startBlockNum must be positive");
        }
        if ( !this.outputModules || !this.outputModules.length ) throw new Error("outputModules is empty");
        if ( !this.forkSteps || !this.forkSteps.length ) throw new Error("forkSteps is empty");

        // Setup Substream
        const stream = this.client.blocks(Request.create({
            modules,
            ...this,
        }));
    
        // Send Substream Data to Adapter
        for await (const response of stream.responses) {
            if ( this.stopped ) break;
            const block = parseBlockData(response);
            if ( !block ) continue;
            this.emit("block", block);
    
            for ( const output of block.outputs ) {
                if ( output.data.oneofKind == "mapOutput" ) {
                    const { value } = output.data.mapOutput;
                    if ( !value.length ) continue;
                    this.emit("mapOutput", output as MapOutput);
                }

                else if ( output.data.oneofKind == "storeDeltas" ) {
                    const { deltas } = output.data.storeDeltas;
                    if ( !deltas.length ) continue;
                    this.emit("storeDeltas", output as StoreDelta);
                } else {
                    console.log(output.data.oneofKind)
                }
            }
            this.emit("cursor", block.cursor);
        }
    }
}