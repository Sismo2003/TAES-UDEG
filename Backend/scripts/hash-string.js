/**
 * hash-string.js — genera el hash de una contraseña para pegarlo a mano en
 * `users.password_hash`.
 *
 * La auth del panel (services/auth.service.js) usa **bcrypt (bcryptjs) cost 10**
 * vía `bcrypt.compare`. NO es argon2 (eso es otro proyecto). El hash resultante
 * empieza con `$2b$10$...` y ya incluye su propia sal, así que se guarda tal cual.
 *
 * Uso:
 *   node scripts/hash-string.js 'mi-contraseña'      # como argumento
 *   node scripts/hash-string.js                      # pregunta por stdin (oculto)
 *   echo 'mi-contraseña' | node scripts/hash-string.js
 *
 * Opcional: COST=12 node scripts/hash-string.js '...'   # sube el cost factor
 *
 * Después, en psql / tu cliente:
 *   UPDATE users SET password_hash = '<hash>', updated_at = now()
 *   WHERE email = 'alguien@prepa2.local';
 */
import bcrypt from 'bcryptjs';
import readline from 'node:readline';

const COST = Number(process.env.COST) || 10;

async function readSecret(prompt) {
  // Si viene por pipe (stdin no es TTY) leemos una línea normal.
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin });
    for await (const line of rl) {
      rl.close();
      return line;
    }
    return '';
  }

  // TTY: preguntamos y ocultamos lo tecleado.
  process.stdout.write(prompt);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const origWrite = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (str) => {
    if (str.includes('\n') || str.includes('\r')) origWrite(str);
  };
  return new Promise((resolve) => {
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const plain = process.argv[2] ?? (await readSecret('Contraseña a hashear: '));

  if (!plain) {
    console.error('Error: no recibí ninguna contraseña.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(String(plain), COST);

  // Sanity check: el hash tiene que verificar contra la contraseña original.
  const ok = await bcrypt.compare(String(plain), hash);
  if (!ok) {
    console.error('Error: el hash generado no verifica. Abortando.');
    process.exit(1);
  }

  console.log(hash);
}

main();
