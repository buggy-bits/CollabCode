function escapeCodeToString(code: string): string {
  return code
    .replace(/\\/g, "\\\\") // Escape backslashes
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/\n/g, "\\n") // Escape newlines
    .replace(/\r/g, "") // Remove carriage returns if any
    .replace(/\t/g, "\\t"); // Escape tabs if any
}

// Example:
const code = `#include <stdio.h>
  int main() {
      printf("Try programiz.pro");
      return 0;
  }`;

console.log('"' + escapeCodeToString(code) + '"');
