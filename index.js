'use strict'

const https = require('https')
const fs = require('fs')
const url = require('url')
const ping = require ("net-ping");
const dns = require('dns')

const PingOptions = {
	retries: 3,
	timeout: 5000
};

const DnsOptions = {
    family: 4
}

let fileBuffer = null;

try {
    fileBuffer = fs.readFileSync("./subs.json", 'utf8')
} catch(e) {
    console.log(`\x1b[31m ERRO |\x1b[0m Cannot find configuration file.`)
    // console.log(e)
    console.log(`\x1b[31m ERRO |\x1b[0m Make sure you have\x1b[37m subs.json\x1b[0m in the same directory.`)
    process.exit(1)
}

let config = JSON.parse(fileBuffer)
if(!config) {
    console.log(`\x1b[31m ERRO |\x1b[0m Malformed configuration file.`)
    process.exit(1)
}

var remainNumber = config.subslist.length

config.subslist.forEach( i => {
    console.log(`\x1b[33m INFO |\x1b[0m Making requests to ${i.name}...`)

    let request = url.parse(i.url)
    request.timeout = 5000

    let response_string = ""

    const req = https.get(request, res => {
        console.log(`\x1b[32m  OK  |\x1b[0m ${i.name} Connected.`)
        
        res.on('data', d => {
            response_string += d
        })

        res.on('end', ()=> {
            console.log(`\x1b[32m  OK  |\x1b[0m ${i.name} Response Received.`)

            let respond_decode = Buffer.from(response_string, 'base64').toString('utf-8')
            
            let vmess_list = respond_decode.split('\n')
            console.log(`\x1b[32m  OK  |\x1b[0m ${i.name} provided ${vmess_list.length} entries`)

            parseVmess(i, vmess_list)
        })
    }).on('error', (e) => {
        console.log(`\x1b[31m ERRO |\x1b[0m Failed to contact ${i.name}`);
        reportCompletion(i, [], [])
    });
})

function parseVmess(configEntry, vmess_list) {
    let servers = vmess_list.map(s => 
        s.startsWith("vmess://") ? JSON.parse(Buffer.from(s.slice("vmess://".length), 'base64').toString('utf-8')) : null
    )
    servers = servers.filter(x => x != null)
    console.log(`\x1b[32m  OK  |\x1b[0m ${configEntry.name} parsed ${servers.length} entries`)

    let named_servers = servers.filter(x => true)
    configEntry["must-include"].forEach((keyword) => {
        named_servers = named_servers.filter(x => x.ps.includes(keyword))
    })
    configEntry["must-exclude"].forEach((keyword) => {
        named_servers = named_servers.filter(x => !x.ps.includes(keyword))
    })

    console.log(`\x1b[32m  OK  |\x1b[0m ${configEntry.name} has ${named_servers.length} entries after filtering`)

    let servers_by_proto = new Object()
    let pings_by_ip = new Set()
    let pinged_hosts = []

    named_servers.forEach(x => {
        servers_by_proto[x.net] = servers_by_proto[x.net] ? [ ...servers_by_proto[x.net], x ] : [x]
    })

    servers_by_proto[config.preferredProto].forEach(key => pings_by_ip.add(key.add))

    console.log(`\x1b[32m  OK  |\x1b[0m ${configEntry.name} has ${servers_by_proto[config.preferredProto].length} entries of matching protocol ${config.preferredProto}`)

    let session = ping.createSession(PingOptions)

    pings_by_ip.forEach(key => {
        console.log (`\x1b[33m INFO |\x1b[0m Resolving DNS for ${key} from ${configEntry.name} `);
        dns.lookup(key, DnsOptions, (err, address) => {
            if(err) {
                console.log (`\x1b[33m WARN |\x1b[0m ${key} from ${configEntry.name} failed to resolve DNS`);
            } else {
                console.log (`\x1b[32m  OK  |\x1b[0m ${key} from ${configEntry.name} resolved to ${address}`);
                session.pingHost(address, (error, target, sent, rcvd) => {
                    var ms = rcvd - sent;
                    if (error)
                        if (error instanceof ping.RequestTimedOutError)
                            console.log (`\x1b[33m WARN |\x1b[0m ${key} from ${configEntry.name} is not alive`);
                        else
                            console.log (`\x1b[33m WARN |\x1b[0m ${key} from ${configEntry.name} errored: ${error.toString()}`);
                    else {
                        console.log (`\x1b[32m  OK  |\x1b[0m ${configEntry.name} :: ${key}, ping is${ms < 100 ? "\x1b[32m" : ms < 200? "\x1b[33m" : "\x1b[31m"} ${ms}ms \x1b[0m`)
                        pinged_hosts.push([key, ms])
                    }
                    pings_by_ip.delete(key)
                    if(pings_by_ip.size == 0) reportCompletion(configEntry, servers_by_proto[config.preferredProto], pinged_hosts)
                })
            }
        })
    })
}

var sumSettings = []
var sumPings = []

function reportCompletion(configEntry, servers, pinged_hosts) {
    remainNumber -= 1
    let sorted_hosts = pinged_hosts.sort((a,b) => a[1] - b[1])
    
    let actual_choice = Math.min(configEntry.choice, pinged_hosts.length)

    console.log (`\x1b[32m  OK  |\x1b[0m Will choose ${actual_choice} servers from ${configEntry.name}`);

    sumSettings.push(...servers)
    sumPings.push(...sorted_hosts.slice(0, actual_choice))
    if(remainNumber == 0) {
        if(config.preferredProto == "ws") sortAndWriteWS(sumSettings, sumPings)
        else if (config.preferredProto == "tcp") sortAndWriteTCP(sumSettings, sumPings)
    }
}

function sortAndWriteWS(servers_by_proto, pinged_hosts) {
    console.log (`\x1b[32m  OK  |\x1b[0m All subscriptions updated.`);

    let fileBuffer = fs.readFileSync("./template.json", 'utf8')

    if(!fileBuffer) {
        process.stdout.write("Cannot find template file.")
        process.exit(1)
    }

    let template = JSON.parse(fileBuffer)
    if(!template) {
        process.stdout.write("Malformed template file.")
        process.exit(1)
    }

    let finalSettings = new Object()
    finalSettings["vnext"] = []
    finalSettings["streamSettings"] = new Object()
    finalSettings["streamSettings"]["network"] = "ws"
    finalSettings.streamSettings.wsSettings = new Object()
    finalSettings.streamSettings.wsSettings.headers = new Object()
    
    sumPings.forEach(address  => {
        let machingHosts = sumSettings.filter(host => host.add == address[0])
        
        if(machingHosts.length != 0) {
            let singleSetting = new Object()
            let chosenEntry = machingHosts[Math.round(Math.random()*(machingHosts.length-1))]

            console.log(`\x1b[32m  OK  |\x1b[0m Chosen server ${chosenEntry.ps}.`)

            if(!finalSettings.streamSettings.wsSettings.path || chosenEntry.path == finalSettings.streamSettings.wsSettings.path) {
                singleSetting["address"] = chosenEntry.add
                singleSetting["port"] = parseInt(chosenEntry.port)
                singleSetting["users"] = [{ "id": chosenEntry.id, "alterId": parseInt(chosenEntry.aid), "email": "t@t.tt", "security": "auto" }]
                finalSettings.vnext.push(singleSetting)
                finalSettings.streamSettings.wsSettings.path = chosenEntry.path
                finalSettings.streamSettings.wsSettings.headers.Host = chosenEntry.host
            }
        } 
    })

    template.outbounds.forEach(rule => {
        if(rule.tag == config.outboundtag) {
            rule.settings.vnext = finalSettings["vnext"]
            rule.streamSettings = finalSettings["streamSettings"]
        }
    })

    fs.writeFile('config.json', JSON.stringify(template, null, 2), (err) => {
            if (err) {
                throw err;
            }
            console.log("\x1b[32m  OK  |\x1b[0m Config saved.");
        }
    )
}

function sortAndWriteTCP(servers_by_proto, pinged_hosts) {
    console.log (`\x1b[32m  OK  |\x1b[0m All subscriptions updated.`);

    let fileBuffer = fs.readFileSync("./template.json", 'utf8')

    if(!fileBuffer) {
        process.stdout.write("Cannot find template file.")
        process.exit(1)
    }

    let template = JSON.parse(fileBuffer)
    if(!template) {
        process.stdout.write("Malformed template file.")
        process.exit(1)
    }

    let finalSettings = new Object()
    finalSettings["vnext"] = []
    finalSettings["streamSettings"] = new Object()
    finalSettings["streamSettings"]["network"] = "tcp"

    sumPings.forEach(address  => {
        let machingHosts = sumSettings.filter(host => host.add == address[0])
        
        if(machingHosts.length != 0) {
            let singleSetting = new Object()
            let chosenEntry = machingHosts[Math.round(Math.random()*(machingHosts.length-1))]
            console.log(`\x1b[32m  OK  |\x1b[0m Chosen server ${chosenEntry.ps}.`)

            singleSetting["address"] = chosenEntry.add
            singleSetting["port"] = chosenEntry.port
            singleSetting["users"] = [{ "id": chosenEntry.id, "alterId": parseInt(chosenEntry.aid), "email": "t@t.tt", "security": "auto" }]
            finalSettings.vnext.push(singleSetting)

        } 
    })

    template.outbounds.forEach(rule => {
        if(rule.tag == config.outboundtag) {
            rule.settings.vnext = finalSettings["vnext"]
            rule.streamSettings = finalSettings["streamSettings"]
        }
    })

    fs.writeFile('config.json', JSON.stringify(template, null, 2), (err) => {
            if (err) {
                throw err;
            }
            console.log("\x1b[32m  OK  |\x1b[0m Config saved.");
        }
    )
}

function _end() {
    const keypress = async () => {
        process.stdin.setRawMode(true)
        return new Promise(resolve => process.stdin.once('data', () => {
            process.stdin.setRawMode(false)
            resolve()
        }))
    }

    (async () => {
        console.log('Press any key to continue...')
        await keypress()
    })().then(process.exit)
}