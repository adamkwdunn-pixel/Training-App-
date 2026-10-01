import { useState } from 'react';
import Icon from './Icon.jsx';

/** Shows an athlete's login details after sign-up / reset, with copy and share buttons. */
export default function LoginDetails({ details, onClose }) {
  const { login, email_sent: sent, email_error: emailError, name } = details;
  const [copied, setCopied] = useState(false);
  const first = String(name || '').split(' ')[0];
  const message = `Hi ${first}, here's your AD Rugby Coaching login:\n\n${login.url}\nEmail: ${login.email}\nTemporary password: ${login.password}\n\nYou'll choose your own password when you first sign in.`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      prompt('Copy these login details:', message);
    }
  };
  const share = () => navigator.share?.({ title: 'AD Rugby Coaching login', text: message }).catch(() => {});
  return (
    <div className="card stack" style={{ borderColor: sent ? 'var(--good)' : 'var(--line)' }}>
      <div className="inline-form">
        <Icon name={sent ? 'check' : 'alert'} />
        <strong className="grow">{sent ? `Login details emailed to ${login.email}` : 'Share these login details'}</strong>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="trash" size={16} /></button>
      </div>
      {!sent && emailError && <p className="small muted" style={{ margin: 0 }}>{emailError}</p>}
      <div className="kv small"><span className="muted">App</span><span>{login.url}</span></div>
      <div className="kv small"><span className="muted">Email</span><span>{login.email}</span></div>
      <div className="kv small"><span className="muted">Temporary password</span><strong className="code">{login.password}</strong></div>
      <div className="row-actions" style={{ marginTop: 0 }}>
        <button className="btn small" onClick={copy}><Icon name="copy" size={16} /> {copied ? 'Copied ✓' : 'Copy message'}</button>
        {navigator.share && <button className="btn small" onClick={share}><Icon name="upload" size={16} /> Share (text / WhatsApp)</button>}
      </div>
    </div>
  );
}
