/** The message a wallet signs to prove address ownership (Sign-In with Ethereum, minimal form).
 *  Shared by the client (builds + signs it) and the server (rebuilds + verifies it) so both sides
 *  produce the exact same bytes. */
export function buildSignInMessage(o: { address: string; nonce: string; issuedAt: string }): string {
  return [
    "Sign in to Coil",
    "",
    `Address: ${o.address}`,
    `Nonce: ${o.nonce}`,
    `Issued At: ${o.issuedAt}`,
    "",
    "This request will not trigger a blockchain transaction or cost gas.",
  ].join("\n");
}
