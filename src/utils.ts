import crypto from "node:crypto";
import { createRegistryFromDescriptors } from "@bufbuild/protobuf";
import * as ipfs from './ipfs.js';

// Substream auto-generated
import { Package } from './generated/sf/substreams/v1/package_pb.js';
import { Clock } from "./generated/sf/substreams/v1/clock_pb.js";
import { BlockScopedData, ModuleOutput, Response } from "./generated/sf/substreams/v1/substreams_pb.js";
import { Registry } from "./index.js";

export function formatDate( seconds: number ) {
    return new Date(seconds * 1000).toISOString().replace(".000Z", "")
}

export function parseBlockData( response: Response ) {
    if (response.message.case !== 'data') return;
    return response.message.value as BlockScopedData;
}

export function getSeconds( clock?: Clock ) {
    return Number(clock?.timestamp?.seconds);
}

export function calculateHeadBlockTimeDrift(clock?: Clock) {
    const seconds = getSeconds(clock);
    const current = Math.floor(new Date().valueOf() / 1000);
    return current - seconds;
}

export function parseStopBlock( startBlock: string, stopBlock?: string ) {
    if (!stopBlock) return;
    if ( stopBlock.includes("+")) return String(Number(startBlock) + Number(stopBlock));
    if ( stopBlock.includes("-")) throw new Error(`stopBlock cannot be negative: ${stopBlock}`);
    return stopBlock;
}

export function unpack( binary: Uint8Array ) {
    try {
        const { modules } = Package.fromBinary(binary);
        const registry = createRegistryFromDescriptors(binary);
        if ( !modules ) throw new Error(`no modules found in binary`);
        return { modules, registry };
    } catch (e: any) {
        throw new Error(`invalid package binary [${e}]`);
    }
}

export async function download(url: string) {
    if ( ipfs.test(url) ) url = ipfs.url(url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`unexpected response ${response.statusText}`)
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
}

export function isBrowser() {
    return typeof window !== "undefined" && typeof window.document !== "undefined";
}

export function isNode() {
    return typeof process !== "undefined" &&
        process.versions != null &&
        process.versions.node != null
}

export function timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export function getTypeName( output: ModuleOutput ) {
    if ( output.data.case === "mapOutput" ) {
        const { typeUrl } = output.data.value;
        return typeUrl.replace("type.googleapis.com/", "")
    }
    throw new Error("cannot get typeName");
}

export function decode(output: ModuleOutput, registry: Registry, typeName: string) {
    if ( !output.data.value ) return null;
    if ( output.data.case === "mapOutput" ) {
        const { value } = output.data.value;
        const message = registry.findMessage(typeName);
        if ( !message ) return null;
        return message.fromBinary(value);
    }
    return null;
}

export function createHash(spkg: Uint8Array) {
    return crypto.createHash("sha256").update(spkg).digest("hex");
}
