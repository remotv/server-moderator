const WebSocket = require("ws");
const Discord = require("discord.js");
const settings = require("./settings.json");
const fs = require("fs");

let state;

try {
    state = JSON.parse(fs.readFileSync("state.json"));
} catch (e) {
    state = { servers: {} };
    console.error("Failed to load state, likely first run", e);
}

ws = new WebSocket(settings.ws_url);

const serverChannelId = "744321153543438367";
const logChannelId = "726676835395567678";

const client = new Discord.Client({
    partials: ["MESSAGE", "CHANNEL", "REACTION"],
});
client.login(settings.discord_token);

ws.onopen = () => {
    console.log("ws opened");
};

ws.onclose = () => {
    console.error("Websocket closed, exiting in 2 seconds");
    setTimeout(() => process.exit(), 2000);
};

client.on("ready", () => {
    ws.send(
        JSON.stringify({
            e: "INTERNAL_LISTENER_AUTHENTICATE",
            d: {
                key: settings.ws_token,
            },
        })
    );

    console.log("ready");
});

client.on("messageReactionAdd", async (reaction, user) => {
    if (user.id === client.user.id) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (e) {
            return;
        }
    }

    if (reaction.message.author.id === client.user.id) {
        for (server of Object.values(state.servers)) {
            if (reaction.message.id === server.message_id) {
                if (reaction.emoji.name === "❌") {
                    denyServer(server.server_id);
                }
            }
        }
    }
});

ws.onmessage = async (event) => {
    let data = JSON.parse(event.data);

    if (data.e === "NEW_ROBOT_SERVER") {
        console.log(data.d);
        if (!state.servers.hasOwnProperty(data.d.server.server_id)) {
            const embed = new Discord.MessageEmbed()
                .setTitle("New Robot Server")
                .setColor(0x00ff99)
                .setDescription(
                    `https://staging.remo.tv/${data.d.server.server_name}/${data.d.server.settings.default_channel}\nCreated by ${data.d.user.username}`
                );

            // client.channels.cache.get(serverChannelId).send(embed);
            const channel = await client.channels.fetch(serverChannelId);
            const msg = await channel.send(embed);
            state.servers[data.d.server.server_id] = {
                server_id: data.d.server.server_id,
                server_name: data.d.server.server_name,
                message_id: msg.id
            };
            saveState();
            await msg.react("❌");
        }
    } else if (data.e === "DELETE_ROBOT_SERVER") {
        if (data.d && data.d.result) {
            const server = state.servers[data.d.server_id];

            if (server) {
                const channel = await client.channels.fetch(serverChannelId);
                const msg = await channel.messages.fetch(server.message_id);
                await msg.delete();

                const logChannel = await client.channels.fetch(logChannelId);

                if (data.d.result.includes('Success')) {
                    const embed = new Discord.MessageEmbed()
                        .setTitle("Server deleted")
                        .setColor(0x1D1075)
                        .setDescription(`Deleted server ${server.server_name}`);
                    
                    await logChannel.send(embed);
                }

                removeServerFromQueue(server.server_id);
            }
        }
    } else {
        console.log(data);
    }
};

const denyServer = (id) => {
    console.log("Trying to deny server");
    try {
        const server = state.servers[id];
        if (server) {
            ws.send(
                JSON.stringify({
                    e: "DELETE_ROBOT_SERVER",
                    d: {
                        server_id: server.server_id,
                    },
                })
            );

            saveState();
        }
    } catch (e) {
        console.error("failed to deny server", e);
    }
};

const removeServerFromQueue = (id) => {
    delete state.servers[id];
    saveState();
};

const saveState = () => {
    fs.writeFileSync("state.json", JSON.stringify(state));
};
