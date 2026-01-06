import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

// A CHAVE deve ter 32 caracteres (256 bits). Pegamos do .env
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || 'mude-isso-para-uma-chave-de-32-caracteres!!';
const ALGORITHM = 'aes-256-gcm';

export function encrypt(text: string): string {
  const iv = randomBytes(16); // Vetor de inicialização (único para cada criptografia)
  const cipher = createCipheriv(
    ALGORITHM,
    scryptSync(ENCRYPTION_KEY, 'salt', 32),
    iv,
  );

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // Garante a integridade do dado

  // Retornamos IV + TAG + TEXTO_CRIPTOGRAFADO em um único conjunto
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(hash: string): string {
  const [iv, tag, encrypted] = hash
    .split(':')
    .map((part) => Buffer.from(part, 'hex'));
  const decipher = createDecipheriv(
    ALGORITHM,
    scryptSync(ENCRYPTION_KEY, 'salt', 32),
    iv,
  );

  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
