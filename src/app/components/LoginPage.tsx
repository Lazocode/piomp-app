'use client';

import React, { useState, useMemo } from 'react';
import {
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Clock,
  Sparkles,
  FileCheck,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, signup, demoLogin, isLocked, lockoutRemaining, failedAttempts } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Análise da Força da Senha
  const passwordCriteria = useMemo(() => {
    return {
      minLength: password.length >= 8,
      hasUpper: /[A-Z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[^A-Za-z0-9]/.test(password),
    };
  }, [password]);

  const passwordScore = useMemo(() => {
    let score = 0;
    if (passwordCriteria.minLength) score += 1;
    if (passwordCriteria.hasUpper) score += 1;
    if (passwordCriteria.hasNumber) score += 1;
    if (passwordCriteria.hasSpecial) score += 1;
    return score;
  }, [passwordCriteria]);

  const passwordStrengthLabel = useMemo(() => {
    if (!password) return { text: 'Insira sua senha', color: 'text-zinc-500', barBg: 'bg-zinc-800' };
    if (passwordScore <= 1) return { text: 'Fraca', color: 'text-red-400', barBg: 'bg-red-500' };
    if (passwordScore === 2) return { text: 'Média', color: 'text-amber-400', barBg: 'bg-amber-500' };
    if (passwordScore === 3) return { text: 'Boa', color: 'text-emerald-400', barBg: 'bg-emerald-500' };
    return { text: 'Forte & Segura', color: 'text-purple-400', barBg: 'bg-purple-500' };
  }, [password, passwordScore]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (isLocked) {
      setErrorMessage(`Acesso temporariamente bloqueado. Aguarde ${lockoutRemaining}s.`);
      return;
    }

    if (!email.trim() || !password) {
      setErrorMessage('Preencha todos os campos obrigatórios.');
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'login') {
        const res = await login(email.trim(), password);
        if (!res.success) {
          setErrorMessage(res.error || 'Falha no login');
        }
      } else {
        // Validações no Cadastro
        if (password !== confirmPassword) {
          setErrorMessage('As senhas não coincidem.');
          setSubmitting(false);
          return;
        }

        if (!passwordCriteria.minLength || !passwordCriteria.hasUpper || !passwordCriteria.hasNumber) {
          setErrorMessage('A senha precisa atender aos requisitos mínimos de segurança.');
          setSubmitting(false);
          return;
        }

        const res = await signup(email.trim(), password, name.trim());
        if (!res.success) {
          setErrorMessage(res.error || 'Falha ao registrar conta');
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickDemo() {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const res = await demoLogin();
      if (!res.success) {
        setErrorMessage(res.error || 'Falha ao entrar com conta demo');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh w-full bg-[#09090b] text-zinc-100 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden">
      
      {/* Luz ambiente de fundo (Glow) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-purple-600/15 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[350px] h-[350px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Caixa Central de Autenticação */}
      <div className="w-full max-w-md relative z-10">
        
        {/* Cabeçalho da Aplicação e Identidade Visual */}
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Acesso Seguro aos Seus PDFs
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Seus documentos técnicos, sínteses de IA e tutor de estudos sob custódia confidencial.
          </p>
        </div>

        {/* Card Principal */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl">
          
          {/* Seletor Segmentado de Modo: Login / Cadastro */}
          <div className="grid grid-cols-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
              }}
              className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMessage(null);
              }}
              className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Criar Conta
            </button>
          </div>

          {/* Alerta de Bloqueio por Força Bruta (Rate Limit ativo) */}
          {isLocked && (
            <div className="p-3.5 mb-4 rounded-xl bg-red-950/70 border border-red-500/60 flex items-start gap-2.5 text-xs text-red-200 animate-pulse">
              <Clock className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Proteção Anti-Força Bruta Ativa</span>
                <span>
                  Bloqueio de segurança acionado por 5 tentativas seguidas. Tente novamente em{' '}
                  <strong className="underline text-white font-mono">{lockoutRemaining}s</strong>.
                </span>
              </div>
            </div>
          )}

          {/* Mensagem de Erro Geral */}
          {errorMessage && !isLocked && (
            <div className="p-3 mb-4 rounded-xl bg-red-950/60 border border-red-500/50 flex items-center gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Formulário de Autenticação */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            
            {/* Campo Nome (Apenas Cadastro) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Seu Nome
                </label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 absolute left-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Como prefere ser chamado"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl text-xs sm:text-sm text-zinc-100 pl-10 pr-3.5 py-2.5 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all font-medium"
                  />
                </div>
              </div>
            )}

            {/* Campo E-mail */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                E-mail Institucional ou Pessoal
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 absolute left-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl text-xs sm:text-sm text-zinc-100 pl-10 pr-3.5 py-2.5 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all font-medium"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-zinc-300">Senha de Acesso</label>
                {mode === 'signup' && (
                  <span className={`text-[11px] font-semibold ${passwordStrengthLabel.color}`}>
                    Força: {passwordStrengthLabel.text}
                  </span>
                )}
              </div>

              <div className="relative flex items-center">
                <Lock className="w-4 h-4 absolute left-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl text-xs sm:text-sm text-zinc-100 pl-10 pr-10 py-2.5 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-zinc-400 hover:text-white transition-colors p-1"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Medidor de Força e Requisitos de Segurança (No Cadastro) */}
              {mode === 'signup' && (
                <div className="mt-2 space-y-2">
                  {/* Barra de Progresso da Senha */}
                  <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden flex gap-1">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`h-full flex-1 transition-all ${
                          passwordScore >= step ? passwordStrengthLabel.barBg : 'bg-transparent'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Checklist Visual de Segurança */}
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] text-zinc-400 pt-1">
                    <span
                      className={`flex items-center gap-1.5 ${
                        passwordCriteria.minLength ? 'text-emerald-400 font-semibold' : ''
                      }`}
                    >
                      {passwordCriteria.minLength ? (
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0 inline-block" />
                      )}
                      <span>8+ caracteres</span>
                    </span>
                    <span
                      className={`flex items-center gap-1.5 ${
                        passwordCriteria.hasUpper ? 'text-emerald-400 font-semibold' : ''
                      }`}
                    >
                      {passwordCriteria.hasUpper ? (
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0 inline-block" />
                      )}
                      <span>Letra maiúscula</span>
                    </span>
                    <span
                      className={`flex items-center gap-1.5 ${
                        passwordCriteria.hasNumber ? 'text-emerald-400 font-semibold' : ''
                      }`}
                    >
                      {passwordCriteria.hasNumber ? (
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0 inline-block" />
                      )}
                      <span>Número</span>
                    </span>
                    <span
                      className={`flex items-center gap-1.5 ${
                        passwordCriteria.hasSpecial ? 'text-emerald-400 font-semibold' : ''
                      }`}
                    >
                      {passwordCriteria.hasSpecial ? (
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0 inline-block" />
                      )}
                      <span>Símbolo (opcional)</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Campo Confirmar Senha (Apenas Cadastro) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Confirme a Senha
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 absolute left-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha criada"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl text-xs sm:text-sm text-zinc-100 pl-10 pr-3.5 py-2.5 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all font-medium"
                  />
                </div>
              </div>
            )}

            {/* Informação sobre tentativas restantes (no Login) */}
            {mode === 'login' && failedAttempts > 0 && failedAttempts < 5 && (
              <p className="text-[11px] text-amber-400/90 font-medium">
                Aviso: {failedAttempts} tentativa{failedAttempts > 1 ? 's' : ''} incorreta{failedAttempts > 1 ? 's' : ''}. Em 5 erros, a conta será bloqueada temporariamente.
              </p>
            )}

            {/* Botão de Envio */}
            <button
              type="submit"
              disabled={submitting || isLocked}
              className="w-full mt-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/30 cursor-pointer"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Acessar Meus Documentos' : 'Criar Conta e Proteger PDFs'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divisor Visual */}
          <div className="relative my-4 flex items-center justify-center">
            <div className="border-t border-zinc-800 w-full" />
            <span className="bg-zinc-900 px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0">
              Ou Teste Imediatamente
            </span>
          </div>

          {/* Botão Acesso Rápido com Conta Demo */}
          <button
            type="button"
            onClick={handleQuickDemo}
            disabled={submitting || isLocked}
            className="w-full py-2.5 px-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Entrar como Estudante Demo (Acesso Rápido)</span>
          </button>
        </div>

        {/* Rodapé de Medidas de Segurança Integradas */}
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col items-center">
            <Lock className="w-3.5 h-3.5 text-purple-400 mb-1" />
            <span className="text-[10px] font-bold text-zinc-300">Sessão Isolada</span>
            <span className="text-[9px] text-zinc-400">Tokens seguros</span>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col items-center">
            <Clock className="w-3.5 h-3.5 text-emerald-400 mb-1" />
            <span className="text-[10px] font-bold text-zinc-300">Anti-Brute Force</span>
            <span className="text-[9px] text-zinc-400">Rate limit ativo</span>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col items-center">
            <FileCheck className="w-3.5 h-3.5 text-indigo-400 mb-1" />
            <span className="text-[10px] font-bold text-zinc-300">PDFs Protegidos</span>
            <span className="text-[9px] text-zinc-400">Acesso autenticado</span>
          </div>
        </div>

      </div>
    </div>
  );
}
