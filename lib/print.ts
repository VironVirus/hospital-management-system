"use client";

export function printHtmlDocument(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.border = "0";
  frame.style.height = "0";
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";

  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = printWindow?.document;

  if (!printWindow || !printDocument) {
    frame.remove();
    throw new Error("Unable to prepare the print document.");
  }

  printDocument.open();
  printDocument.write(html);
  printDocument.close();

  const runPrint = () => {
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => frame.remove(), 1000);
  };

  if (printDocument.readyState === "complete") {
    window.setTimeout(runPrint, 50);
    return;
  }

  frame.onload = runPrint;
}
