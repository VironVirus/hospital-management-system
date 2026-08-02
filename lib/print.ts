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

export function downloadHtmlDocument(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
