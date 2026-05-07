const pixRegex = /\[PIX:([0-9.,]+)?\]/gi;
let reply = "Claro! Aqui está o código: [PIX:50.00] Qualquer dúvida, chama!";

function generatePixBrCode(amountStr) {
    return "00020126360014br.gov.bcb.pix011463160686000106520400005303986540550.005802BR5925JESSICA RODRIGUES DOS SAN6009Itamaraju62070503***6304F7CB";
}

reply = reply.replace(pixRegex, (match, val) => {
    let amt = 0;
    if (val) {
        amt = parseFloat(val.replace(',', '.'));
        if (isNaN(amt)) amt = 0;
    }
    const brCode = generatePixBrCode(amt);
    return `[SPLIT]${brCode}[SPLIT]`;
});

reply = reply.replace(/63\.160\.686\/0001-06/g, '[SPLIT]63.160.686/0001-06[SPLIT]');

console.log("REPLY AFTER REPLACES:", reply);

const rawMessages = reply.split(/\[SPLIT\]/i).map(t => t.trim()).filter(t => t.length > 0);
console.log("RAW MESSAGES MAP:", JSON.stringify(rawMessages));
