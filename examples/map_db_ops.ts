import { Substreams, download } from "../";

// User input
const host = "eos.firehose.eosnation.io:9001";
const substream = "QmUc8qGvJ8rVsTQV6L2pvZEEwpfw3K6LxcxX9FMvF4cPB4";
const outputModules = ["map_db_ops"];
const startBlockNum = "285135425";
const stopBlockNum = "285136425";

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
        for ( const dbOp of dbOps ) {
            console.log(dbOp);
        }
    });
    
    // start streaming Substream
    await substreams.start(modules);

    // end of Substream
    console.log("done");
    process.exit();
})();