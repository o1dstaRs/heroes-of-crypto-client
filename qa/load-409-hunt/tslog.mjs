// Timestamp pipe: prefixes every stdin line with an ISO timestamp. Used to make the server log
// time-correlatable with the browser/DB pollers.
import readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
    process.stdout.write(`${new Date().toISOString()} ${line}\n`);
});
