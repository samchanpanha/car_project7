import { parseAbaPayWayMessage, isAbaPayWayMessage } from "./src/lib/api/aba-parser";
import { recordAbaTransaction } from "./src/lib/api/aba-sync";

// Your payment message from PayWay by ABA
const paymentMessage = "PayWay by ABA : ៛100 paid by SAM CHAN PANHA (*849) on Oct 28, 01:00 PM via ABA KHQR (Wing Bank (Cambodia) Plc) at SAM CHAN PANHA. Trx. ID: 179316724177253, APV: 547598.";

console.log("Starting manual ABA PayWay sync...");
console.log("Message:", paymentMessage);
console.log("Is ABA message?", isAbaPayWayMessage(paymentMessage));

// Parse the message
const parsed = parseAbaPayWayMessage(paymentMessage);
console.log("\nParsed transaction:", JSON.stringify(parsed, null, 2));

if (parsed) {
  // Record the transaction
  recordAbaTransaction(parsed, {
    messageId: Date.now(),
    chatId: "-1004489863210",
    botToken: process.env.TELEGRAM_BOT_TOKEN
  }).then((result) => {
    console.log("\nSync result:", JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch((err) => {
    console.error("Sync error:", err);
    process.exit(1);
  });
} else {
  console.error("Failed to parse the payment message");
  process.exit(1);
}