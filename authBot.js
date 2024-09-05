import { Client, GatewayIntentBits } from 'discord.js';
import fs from 'fs';
import csv from 'csv-parser';
import schedule from 'node-schedule';
import moment from 'moment';

const TOKEN = 'YOUR_BOT_TOKEN_HERE'; // Replace with your actual token
const CSV_FILE = 'students.csv';

// Create a new Discord client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ]
});

const OTPs = {};  // Store OTPs temporarily

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Connected to the following servers:');
    client.guilds.cache.forEach(guild => {
        console.log(`- ${guild.name} (ID: ${guild.id})`);
    });
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    console.log(`Received message: ${message.content}`);

    // Handle mobile number input
    if (message.content.match(/^\+?\d+$/)) {
        console.log('Mobile number detected');
        await verifyMobileNumber(message.content, message);
    } else if (message.content.startsWith('!verify')) {
        console.log('!verify command detected');
        const args = message.content.split(' ');
        if (args.length !== 2) {
            return message.channel.send('Invalid command usage. Please provide your mobile number.');
        }
        const mobileNumber = args[1];
        await verifyMobileNumber(mobileNumber, message);
    }
});

async function verifyMobileNumber(mobileNumber, message) {
    console.log(`Verifying mobile number: ${mobileNumber}`);
    const results = [];
    fs.createReadStream(CSV_FILE)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            const user = results.find(row => row.mobile === mobileNumber);
            if (user) {
                const otp = generateOTP();
                OTPs[message.author.id] = otp;

                // Send OTP to the user via DM
                try {
                    await message.author.send(`Your OTP is ${otp}. Please reply with this OTP to verify.`);
                    message.channel.send('OTP has been sent to your private messages. Please check your DMs.');
                } catch (error) {
                    console.error('Error sending DM:', error);
                    message.channel.send('I was unable to send you a DM. Please ensure your DM settings allow messages from this server.');
                }

                collectOTP(message, user);
            } else {
                message.channel.send('Mobile number not found.');
            }
        })
        .on('error', (error) => {
            console.error('Error reading CSV file:', error);
        });
}

function collectOTP(message, user = null) {
    const filter = (response) => response.author.id === message.author.id;
    message.author.dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] })
        .then(collected => {
            const otp = collected.first().content;
            if (OTPs[message.author.id] === otp) {
                if (user) {
                    assignRoleAndChannelAccess(message, user.college);
                } else {
                    message.channel.send('OTP verified successfully.');
                }
                delete OTPs[message.author.id];  // Clear OTP after verification
            } else {
                message.channel.send('Incorrect OTP.');
            }
        })
        .catch(() => {
            message.channel.send('You did not enter the OTP in time.');
        });
}

function assignRoleAndChannelAccess(message, userCollege) {
    let roleName, channelName;

    // Replace with actual logic to map colleges to roles and channels
    if (userCollege === 'College A') {
        roleName = 'RoleA';
        channelName = 'ChannelA';
    } else if (userCollege === 'College B') {
        roleName = 'RoleB';
        channelName = 'ChannelB';
    }

    if (roleName && channelName) {
        const role = message.guild.roles.cache.find(role => role.name.toLowerCase() === roleName.toLowerCase());
        const channel = message.guild.channels.cache.find(channel => channel.name.toLowerCase() === channelName.toLowerCase());
        const member = message.guild.members.cache.get(message.author.id);

        if (role) {
            member.roles.add(role).then(() => {
                if (channel) {
                    channel.permissionOverwrites.create(member, { VIEW_CHANNEL: true });
                    message.channel.send(`Role \`${roleName}\` assigned and access to \`${channelName}\` granted!`);
                } else {
                    message.channel.send(`Channel \`${channelName}\` not found.`);
                }
            }).catch(error => {
                console.error('Error assigning role:', error);
                message.channel.send('There was an error assigning the role.');
            });
        } else {
            message.channel.send(`Role \`${roleName}\` not found.`);
        }
    } else {
        message.channel.send('Your college is not supported.');
    }
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Function to schedule contest reminders
async function scheduleContestReminders(contests) {
    contests.forEach(contest => {
        const startTime = new Date(contest.contestStartDate);
        const reminderTime = new Date(startTime);
        reminderTime.setHours(startTime.getHours() - 2); // 2 hours before the contest

        // Schedule reminder for 2 hours before the contest
        schedule.scheduleJob(reminderTime, async () => {
            const message = `Everyone must participate in "${contest.contestName}" on ${moment(startTime).format('dddd, D MMM YYYY hh:mm A')}.
\n\nRegister Now - ${contest.contestUrl}`;
            await sendToAllTextChannels(contest.guild, message);
        });

        // Schedule reminder for the day of the contest
        schedule.scheduleJob(startTime, async () => {
            const message = `Today is the day for "${contest.contestName}"! It starts at ${moment(startTime).format('dddd, D MMM YYYY hh:mm A')}.
\n\nRegister Now - ${contest.contestUrl}`;
            await sendToAllTextChannels(contest.guild, message);
        });
    });
}

// Function to send messages to all text channels in a guild
async function sendToAllTextChannels(guild, message) {
    guild.channels.cache.forEach(channel => {
        if (channel.isTextBased() && channel.permissionsFor(guild.roles.everyone).has('SEND_MESSAGES')) {
            channel.send(message).catch(console.error);
        }
    });
}

client.login(TOKEN);
