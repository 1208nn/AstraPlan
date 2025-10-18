import { Hono } from 'hono';
import { Database } from '../db/queries';
import { hashPassword, verifyPassword, signJWT } from '../utils/crypto';
import { validateUsername, validatePassword } from '../utils/helpers';
import { MicrosoftGraphService } from '../services/microsoft';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const auth = new Hono<{ Bindings: CloudflareBindings }>();

auth.post('/register', async (c) => {
  try {
    const { username, password, inviteCode } = await c.req.json();

    if (!validateUsername(username)) {
      return c.json({ error: 'Invalid username format' }, 400);
    }

    if (!validatePassword(password)) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const db = new Database(c.env.DB, c.env.ENCRYPTION_KEY);
    
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return c.json({ error: 'Username already taken' }, 400);
    }

    const invite = await db.getUserByInviteCode(inviteCode);
    if (!invite || invite.username) {
      return c.json({ error: 'Invalid or used invite code' }, 400);
    }

    const passwordHash = await hashPassword(password);
    const user = await db.registerUser(inviteCode, username, passwordHash, false);

    if (!user) {
      return c.json({ error: 'Registration failed' }, 500);
    }

    const token = await signJWT({ userId: user.id }, c.env.JWT_SECRET);

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        remaining_quota: user.remaining_quota,
        data_source: user.data_source
      }
    });
  } catch (error) {
    return c.json({ error: 'Registration failed' }, 500);
  }
});

auth.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json();

    const db = new Database(c.env.DB, c.env.ENCRYPTION_KEY);
    const user = await db.getUserByUsername(username);

    if (!user || !user.password_hash) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const token = await signJWT({ userId: user.id }, c.env.JWT_SECRET);

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        remaining_quota: user.remaining_quota,
        data_source: user.data_source,
        is_admin: user.is_admin
      }
    });
  } catch (error) {
    return c.json({ error: 'Login failed' }, 500);
  }
});

auth.get('/ms/auth', async (c) => {
  const msService = new MicrosoftGraphService(
    c.env.MS_CLIENT_ID,
    c.env.MS_CLIENT_SECRET,
    c.env.MS_REDIRECT_URI
  );

  const state = crypto.randomUUID();
  const url = msService.getAuthUrl(state);

  return c.json({ url, state });
});

auth.post('/ms/callback', async (c) => {
  try {
    const { code, inviteCode, username } = await c.req.json();

    const msService = new MicrosoftGraphService(
      c.env.MS_CLIENT_ID,
      c.env.MS_CLIENT_SECRET,
      c.env.MS_REDIRECT_URI
    );

    const msToken = await msService.getTokenFromCode(code);
    const db = new Database(c.env.DB, c.env.ENCRYPTION_KEY);

    if (username && inviteCode) {
      if (!validateUsername(username)) {
        return c.json({ error: 'Invalid username format' }, 400);
      }

      const existingUser = await db.getUserByUsername(username);
      if (existingUser) {
        return c.json({ error: 'Username already taken' }, 400);
      }

      const invite = await db.getUserByInviteCode(inviteCode);
      if (!invite || invite.username) {
        return c.json({ error: 'Invalid or used invite code' }, 400);
      }

      const tempPassword = crypto.randomUUID();
      const passwordHash = await hashPassword(tempPassword);
      const user = await db.registerUser(inviteCode, username, passwordHash, true);

      if (!user) {
        return c.json({ error: 'Registration failed' }, 500);
      }

      await db.updateUserMSToken(user.id, msToken);

      const token = await signJWT({ userId: user.id }, c.env.JWT_SECRET);

      return c.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          remaining_quota: user.remaining_quota,
          data_source: user.data_source
        }
      });
    } else {
      const existingByToken = await db.getUserByUsername(msToken.email);
      if (existingByToken) {
        await db.updateUserMSToken(existingByToken.id, msToken);
        const token = await signJWT({ userId: existingByToken.id }, c.env.JWT_SECRET);
        
        return c.json({
          success: true,
          token,
          user: {
            id: existingByToken.id,
            username: existingByToken.username,
            remaining_quota: existingByToken.remaining_quota,
            data_source: existingByToken.data_source
          }
        });
      }

      return c.json({ 
        success: false, 
        requiresRegistration: true,
        email: msToken.email 
      });
    }
  } catch (error) {
    return c.json({ error: 'Microsoft login failed' }, 500);
  }
});

auth.post('/passkey/register-options', async (c) => {
  try {
    const { userId } = await c.req.json();
    const db = new Database(c.env.DB, c.env.ENCRYPTION_KEY);
    const user = await db.getUserById(userId);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    const options = await generateRegistrationOptions({
      rpName: c.env.RP_NAME || 'AstraPlan',
      rpID: c.env.RP_ID || 'localhost',
      userID: user.id.toString(),
      userName: user.username || '',
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    return c.json(options);
  } catch (error) {
    return c.json({ error: 'Failed to generate options' }, 500);
  }
});

auth.post('/passkey/register-verify', async (c) => {
  try {
    const { userId, response, name } = await c.req.json();
    const db = new Database(c.env.DB, c.env.ENCRYPTION_KEY);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: response.challenge,
      expectedOrigin: c.req.header('origin') || '',
      expectedRPID: c.env.RP_ID || 'localhost',
    });

    if (verification.verified && verification.registrationInfo) {
      const passkey = {
        id: verification.registrationInfo.credentialID.toString(),
        publicKey: Buffer.from(verification.registrationInfo.credentialPublicKey).toString('base64'),
        counter: verification.registrationInfo.counter,
        transports: response.transports,
        name: name || 'Passkey',
        created_at: new Date().toISOString()
      };

      await db.addPasskey(userId, passkey);

      return c.json({ success: true });
    }

    return c.json({ error: 'Verification failed' }, 400);
  } catch (error) {
    return c.json({ error: 'Failed to verify passkey' }, 500);
  }
});

export default auth;
