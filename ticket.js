// ticket.js
function yyyymmdd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function copyAsTicket() {
  const el = document.querySelector("#resultCard");
  if (!el) {
    alert("Capture target (#resultCard) not found. Add id='resultCard' to the result card container.");
    return;
  }

  if (!window.html2canvas) {
    alert("html2canvas not loaded.");
    return;
  }

  const canvas = await html2canvas(el, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true
  });

  canvas.toBlob(async (blob) => {
    if (!blob) return;

    // 1) Download PNG
    const filename = `EmojiPick-ticket-${yyyymmdd()}.png`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    // 2) Try clipboard copy (optional; may fail depending on browser permissions)
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        // You can replace this with a toast later
        console.log("Ticket image copied to clipboard.");
      }
    } catch (e) {
      console.log("Clipboard copy skipped:", e);
    }
  }, "image/png");
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#btnCopyTicket");
  if (btn) btn.addEventListener("click", copyAsTicket);
});
