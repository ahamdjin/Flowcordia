import { appendFileSync, readFileSync } from "node:fs";
import { createServer } from "node:net";

const port = Number(process.env.FLOWCORDIA_SMTP_FIXTURE_PORT ?? "2525");
const modeFile = process.env.FLOWCORDIA_SMTP_MODE_FILE;
const deliveriesFile = process.env.FLOWCORDIA_SMTP_DELIVERIES_FILE;
if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || !modeFile || !deliveriesFile) {
  throw new Error("The SMTP failure fixture configuration is invalid.");
}

function mode() {
  try {
    return readFileSync(modeFile, "utf8").trim() === "reject" ? "reject" : "accept";
  } catch {
    return "reject";
  }
}

const server = createServer((socket) => {
  socket.setEncoding("utf8");
  socket.write("220 flowcordia-beta-failure ESMTP\r\n");
  let buffer = "";
  let dataMode = false;
  let message = "";

  socket.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const newline = buffer.indexOf("\n");
      const line = buffer.slice(0, newline + 1);
      buffer = buffer.slice(newline + 1);
      const normalized = line.replace(/\r?\n$/, "");

      if (dataMode) {
        if (normalized === ".") {
          dataMode = false;
          if (mode() === "reject") {
            socket.write("451 4.3.0 controlled provider outage\r\n");
          } else {
            appendFileSync(
              deliveriesFile,
              `${JSON.stringify({ acceptedAt: new Date().toISOString(), bytes: Buffer.byteLength(message) })}\n`,
              { mode: 0o600 }
            );
            socket.write("250 2.0.0 accepted\r\n");
          }
          message = "";
        } else {
          message += line;
        }
        continue;
      }

      const command = normalized.toUpperCase();
      if (command.startsWith("EHLO") || command.startsWith("HELO")) {
        socket.write("250-flowcordia-beta-failure\r\n250 8BITMIME\r\n");
      } else if (command.startsWith("MAIL FROM:") || command.startsWith("RCPT TO:")) {
        socket.write("250 2.1.0 accepted\r\n");
      } else if (command === "DATA") {
        dataMode = true;
        message = "";
        socket.write("354 end with <CRLF>.<CRLF>\r\n");
      } else if (command === "RSET" || command === "NOOP") {
        socket.write("250 2.0.0 ok\r\n");
      } else if (command === "QUIT") {
        socket.end("221 2.0.0 bye\r\n");
      } else {
        socket.write("250 2.0.0 ok\r\n");
      }
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Flowcordia SMTP failure fixture listening on ${port}.`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
