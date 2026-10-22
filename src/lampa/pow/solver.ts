import { calculateSha256 } from './sha256.js';

export interface ChallengePayload {
  salt: string;
  difficulty: number;
  timestamp: number;
  signature: string;
}

export interface ChallengeSolution {
  salt: string;
  nonce: number;
  timestamp: number;
  signature: string;
}

export async function solveChallenge(challenge: ChallengePayload): Promise<ChallengeSolution> {
  const targetPrefix = '0'.repeat(challenge.difficulty);
  let nonce = 0;

  while (true) {
    const input = `${challenge.salt}:${nonce}`;
    const hash = await calculateSha256(input);

    if (hash.startsWith(targetPrefix)) {
      return {
        salt: challenge.salt,
        nonce,
        timestamp: challenge.timestamp,
        signature: challenge.signature,
      };
    }

    nonce++;

    // Yield control to UI thread every 2500 iterations to avoid freezing TV animations
    if (nonce % 2500 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}
