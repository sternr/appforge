import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../stores/settingsStore.js';
import Button from '../components/ui/Button.js';

export default function OnboardingPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const navigate = useNavigate();
  const setApiKey = useSettingsStore((s) => s.setApiKey);

  const isValidKey = key.startsWith('sk-ant-') && key.length > 20;

  const handleSubmit = async () => {
    if (!isValidKey) return;
    setTesting(true);
    setError('');

    try {
      // Quick validation — send a tiny request to Claude
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (!res.ok) {
        setError('Invalid API key. Please check and try again.');
        setTesting(false);
        return;
      }

      await setApiKey(key);
      navigate('/', { replace: true });
    } catch {
      setError('Could not connect to Claude. Check your internet connection.');
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center"
      >
        <div className="text-6xl mb-4">⚡</div>
        <h1 className="text-3xl font-bold mb-2">AppForge</h1>
        <p className="text-text-muted mb-8">
          Build apps with just a description.
        </p>

        <div className="text-left mb-4">
          <label className="text-sm text-text-muted block mb-2">
            Your Anthropic API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full px-4 py-3 bg-surface-light border border-surface-lighter rounded-xl text-text placeholder-text-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {error && (
          <p className="text-danger text-sm mb-4">{error}</p>
        )}

        <p className="text-xs text-text-dim mb-6">
          Your key stays on this device. It's never sent to our servers —
          only directly to Anthropic.
        </p>

        <Button
          fullWidth
          size="lg"
          onClick={handleSubmit}
          disabled={!isValidKey || testing}
        >
          {testing ? 'Verifying...' : 'Get Started'}
        </Button>
      </motion.div>
    </div>
  );
}
