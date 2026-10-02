import { NextResponse } from 'next/server';
import { mockDb } from '../../lib/mockStore';

// Validador simples de complexidade de senha
export function validatePasswordSecurity(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'A senha deve conter no mínimo 8 caracteres.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'A senha deve conter pelo menos uma letra maiúscula.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'A senha deve conter pelo menos um número.' };
  }
  return { valid: true };
}

// Validador de formato de e-mail (RFC 5322 simplificado)
export function validateEmailFormat(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, password, name } = body;

    // 1. ENDPOINT: VERIFICAÇÃO DE SESSÃO ATIVA (ME)
    if (action === 'me') {
      const cookieHeader = request.headers.get('cookie') || '';
      const match = cookieHeader.match(/poimp_session=([^;]+)/);
      if (!match) {
        return NextResponse.json({ authenticated: false, user: null });
      }
      const token = decodeURIComponent(match[1]);
      const tokenParts = token.split(':');
      if (tokenParts.length >= 2) {
        const userId = tokenParts[0];
        const user = mockDb.users.find((u) => u.id === userId);
        if (user) {
          return NextResponse.json({
            authenticated: true,
            user: { id: user.id, email: user.email, name: user.name },
          });
        }
      }
      return NextResponse.json({ authenticated: false, user: null });
    }

    // 2. ENDPOINT: ENCERRAMENTO DE SESSÃO (LOGOUT)
    if (action === 'logout') {
      const response = NextResponse.json({ success: true });
      response.cookies.set('poimp_session', '', {
        path: '/',
        httpOnly: true,
        maxAge: 0,
        sameSite: 'lax',
      });
      return response;
    }

    // 3. ENDPOINT: LOGIN
    if (action === 'login') {
      if (!email || !password) {
        return NextResponse.json(
          { error: 'E-mail e senha são obrigatórios.' },
          { status: 400 }
        );
      }

      if (!validateEmailFormat(email)) {
        return NextResponse.json(
          { error: 'Por favor, insira um endereço de e-mail válido.' },
          { status: 400 }
        );
      }

      const cleanEmail = email.toLowerCase().trim();
      const user = mockDb.findUserByEmail(cleanEmail);

      // Verificação de credenciais
      if (!user || user.password_hash !== password) {
        return NextResponse.json(
          { error: 'E-mail ou senha incorretos. Verifique suas credenciais.' },
          { status: 401 }
        );
      }

      const sessionToken = `${user.id}:${Buffer.from(cleanEmail).toString('base64')}:${Date.now()}`;
      const response = NextResponse.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name },
      });

      response.cookies.set('poimp_session', sessionToken, {
        path: '/',
        httpOnly: false, // Disponível para validação no cliente e servidor
        maxAge: 60 * 60 * 24 * 7, // 7 dias de persistência
        sameSite: 'lax',
      });

      return response;
    }

    // 4. ENDPOINT: CADASTRO DE NOVO USUÁRIO (SIGNUP)
    if (action === 'signup') {
      if (!email || !password) {
        return NextResponse.json(
          { error: 'E-mail e senha são obrigatórios.' },
          { status: 400 }
        );
      }

      if (!validateEmailFormat(email)) {
        return NextResponse.json(
          { error: 'Por favor, forneça um formato de e-mail válido (exemplo: usuario@dominio.com).' },
          { status: 400 }
        );
      }

      const passCheck = validatePasswordSecurity(password);
      if (!passCheck.valid) {
        return NextResponse.json(
          { error: passCheck.reason },
          { status: 400 }
        );
      }

      const cleanEmail = email.toLowerCase().trim();
      const existing = mockDb.findUserByEmail(cleanEmail);
      if (existing) {
        return NextResponse.json(
          { error: 'Este e-mail já está registrado no sistema. Faça login.' },
          { status: 409 }
        );
      }

      const newUser = mockDb.createUser(cleanEmail, password, name);
      const sessionToken = `${newUser.id}:${Buffer.from(cleanEmail).toString('base64')}:${Date.now()}`;

      const response = NextResponse.json({
        success: true,
        user: { id: newUser.id, email: newUser.email, name: newUser.name },
      });

      response.cookies.set('poimp_session', sessionToken, {
        path: '/',
        httpOnly: false,
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
      });

      return response;
    }

    return NextResponse.json({ error: 'Ação não suportada.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno de autenticação';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
