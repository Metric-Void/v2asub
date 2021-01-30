const { exec } = require('pkg')
const archiver = require('archiver');
const fs = require('fs');

const stem_name = "v2asub"
const exe_tails = [
    "-linux",
    "-macos",
    "-win.exe"
]
const extra_files = [
    ["subs.example.json", "subs.example.json"],
    ["template.json", "template.json"],
    ["node_modules/raw-socket/build/Release/raw.node", "raw.node"]
]


exec([ "." ]).then(function() {
    exe_tails.forEach(i => {
        const bin_name = stem_name + i;
        const zip_name = "/build/" + stem_name + i + ".zip";

        console.log(`Packing ${bin_name} to ${zip_name}`)

        const output = fs.createWriteStream(__dirname + zip_name);
        if(!fs.existsSync(__dirname + zip_name)) {
            fs.writeFileSync(__dirname + zip_name)
        }
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        output.on('close', function() {
            console.log(`${zip_name}: ${archive.pointer()} bytes.`);
            fs.unlink(bin_name, ()=>{console.log(`${bin_name} removed.`)})
        });

        archive.pipe(output)
        
        extra_files.forEach(j => {
            archive.file(j[0], {"name": j[1]})
        })
        archive.file(bin_name)

        archive.finalize();
    });
    console.log('Dispatch completed. Waiting for async operations to finish...')
}).catch(function(error) {
    console.error(error)
})