import { Substreams, download } from "../";
import { decodeBalance, decodeStat } from "./abi/eosio.token";
import { DatabaseOperation } from "./interfaces";

// User input
const host = "eos.firehose.eosnation.io:9001";
const substream = "https://eos.mypinata.cloud/ipfs/QmSS4cYiaEHUjd2KddJo6xdmXjfVnq6iJJuKAUz26NhDmL";
const outputModules = ["map_db_ops"];
const startBlockNum = "283000000";
const stopBlockNum = "283001000";

// Initialize Substreams
const substreams = new Substreams(host, {
    startBlockNum,
    stopBlockNum,
    outputModules,
});

(async () => {
    // download Substream from IPFS
    const {modules, registry} = await download(substream);
    
    // Find Protobuf message types
    const DatabaseOperations = registry.findMessage("antelope.common.v1.DatabaseOperations");
    if ( !DatabaseOperations) throw new Error("Could not find DatabaseOperations message type");
    
    substreams.on("mapOutput", output => {
        const { dbOps } = DatabaseOperations.fromBinary(output.data.mapOutput.value);
        for ( const dbOp of dbOps as DatabaseOperation[] ) {
            if ( dbOp.code != "eosio.token") continue;
            if ( dbOp.tableName === "accounts") {
                const balance = decodeBalance(dbOp);
                if ( !balance ) continue;
                console.log({owner: dbOp.scope, balance});
            }
            if ( dbOp.tableName === "stat") {
                const supply = decodeStat(dbOp);
                if ( !supply ) continue; 
                console.log({contract: dbOp.code, supply});
            }
        }
    });

    // start streaming Substream
    await substreams.start(modules);

    // end of Substream
    console.log("done");
    process.exit();
})();