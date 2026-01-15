import { useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, Save, Key, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const Settings = () => {
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await axios.post(`${API}/settings/telegram-credentials`, {
        api_id: apiId,
        api_hash: apiHash
      });

      toast.success('Credentials updated! Silakan restart backend dan setup Telegram lagi.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update credentials');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 md:p-8" style={{ backgroundColor: 'var(--background-primary)' }}>
      {/* Header */}
      <div className="mb-8">
        <h1 
          className="text-5xl font-bold mb-2"
          style={{ 
            fontFamily: 'Barlow Condensed, sans-serif',
            color: 'var(--foreground-primary)'
          }}
        >
          SETTINGS
        </h1>
        <p style={{ color: 'var(--foreground-secondary)' }}>
          Konfigurasi aplikasi dan Telegram credentials
        </p>
      </div>

      {/* Warning Banner */}
      <div 
        className="p-4 rounded-lg border mb-6 flex items-start gap-3"
        style={{
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          borderColor: 'var(--status-success)'
        }}
      >
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-success)' }} />
        <div className="text-sm">
          <p className="font-semibold mb-1" style={{ color: 'var(--foreground-primary)' }}>
            ✓ API Credentials Sudah Benar
          </p>
          <p style={{ color: 'var(--foreground-secondary)' }}>
            Credentials Telegram sudah valid. Silakan setup Telegram di menu Telegram Setup atau click banner kuning untuk mengaktifkan bot automation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Instructions */}
        <div 
          className="p-6 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <h2 
            className="text-2xl font-bold mb-4"
            style={{ 
              fontFamily: 'Barlow Condensed, sans-serif',
              color: 'var(--foreground-primary)'
            }}
          >
            CARA MENDAPATKAN API CREDENTIALS
          </h2>

          <div className="space-y-4 text-sm">
            <div>
              <p className="font-semibold mb-2" style={{ color: 'var(--accent-primary)' }}>
                Step 1: Buka Telegram Developer Portal
              </p>
              <a
                href="https://my.telegram.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm hover:underline"
                style={{ color: 'var(--accent-primary)' }}
              >
                <ExternalLink className="w-4 h-4" />
                https://my.telegram.org
              </a>
            </div>

            <div>
              <p className="font-semibold mb-2" style={{ color: 'var(--foreground-primary)' }}>
                Step 2: Login dengan Phone Number
              </p>
              <p style={{ color: 'var(--foreground-secondary)' }}>
                Masukkan nomor HP Anda (yang terdaftar untuk @dwijayanto) dan verifikasi dengan kode dari Telegram app.
              </p>
            </div>

            <div>
              <p className="font-semibold mb-2" style={{ color: 'var(--foreground-primary)' }}>
                Step 3: API Development Tools
              </p>
              <p style={{ color: 'var(--foreground-secondary)' }}>
                Setelah login, click menu <span className="font-mono bg-background-tertiary px-2 py-1 rounded">"API development tools"</span>
              </p>
            </div>

            <div>
              <p className="font-semibold mb-2" style={{ color: 'var(--foreground-primary)' }}>
                Step 4: Create Application
              </p>
              <p style={{ color: 'var(--foreground-secondary)' }} className="mb-2">
                Isi form dengan:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2" style={{ color: 'var(--foreground-secondary)' }}>
                <li>App title: <span className="font-mono">WASKITA LBS</span></li>
                <li>Short name: <span className="font-mono">waskita</span></li>
                <li>Platform: <span className="font-mono">Other</span></li>
              </ul>
            </div>

            <div>
              <p className="font-semibold mb-2" style={{ color: 'var(--foreground-primary)' }}>
                Step 5: Salin Credentials
              </p>
              <p style={{ color: 'var(--foreground-secondary)' }}>
                Setelah create app, Anda akan lihat:
              </p>
              <div 
                className="mt-2 p-3 rounded font-mono text-xs"
                style={{ 
                  backgroundColor: 'var(--background-tertiary)',
                  color: 'var(--foreground-primary)'
                }}
              >
                App api_id: <span style={{ color: 'var(--accent-primary)' }}>12345678</span><br/>
                App api_hash: <span style={{ color: 'var(--accent-primary)' }}>abc123def456...</span>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--foreground-muted)' }}>
                ⚠️ API ID adalah angka, API Hash adalah 32 karakter string
              </p>
            </div>
          </div>

          <div 
            className="mt-6 p-4 rounded-lg"
            style={{
              backgroundColor: 'rgba(0, 217, 255, 0.1)',
              borderLeft: '4px solid var(--accent-primary)'
            }}
          >
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--accent-primary)' }}>
              💡 CATATAN PENTING
            </p>
            <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
              User ID yang Anda dapat dari Telegram app (35564970) BERBEDA dengan API ID yang perlu didapat dari my.telegram.org. Pastikan menggunakan API ID yang benar dari developer portal.
            </p>
          </div>
        </div>

        {/* Update Form */}
        <div 
          className="p-6 rounded-lg border"
          style={{
            backgroundColor: 'var(--background-secondary)',
            borderColor: 'var(--borders-default)'
          }}
        >
          <h2 
            className="text-2xl font-bold mb-6"
            style={{ 
              fontFamily: 'Barlow Condensed, sans-serif',
              color: 'var(--foreground-primary)'
            }}
          >
            UPDATE API CREDENTIALS
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label 
                htmlFor="api-id" 
                className="text-xs uppercase tracking-wide mb-2 block"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                API ID
              </Label>
              <div className="relative">
                <Key 
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                  style={{ color: 'var(--foreground-muted)' }}
                />
                <Input
                  id="api-id"
                  type="text"
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value)}
                  className="pl-10 font-mono bg-background-tertiary border-borders-default"
                  style={{ color: '#000000' }}
                  placeholder="12345678"
                  required
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                Angka yang didapat dari my.telegram.org
              </p>
            </div>

            <div>
              <Label 
                htmlFor="api-hash" 
                className="text-xs uppercase tracking-wide mb-2 block"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                API Hash
              </Label>
              <div className="relative">
                <Key 
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                  style={{ color: 'var(--foreground-muted)' }}
                />
                <Input
                  id="api-hash"
                  type="text"
                  value={apiHash}
                  onChange={(e) => setApiHash(e.target.value)}
                  className="pl-10 font-mono bg-background-tertiary border-borders-default"
                  style={{ color: '#000000' }}
                  placeholder="abc123def456..."
                  required
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                String 32 karakter dari my.telegram.org
              </p>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full py-6 font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--background-primary)',
                fontFamily: 'Rajdhani, sans-serif'
              }}
            >
              <Save className="w-5 h-5 mr-2" />
              {submitting ? 'SAVING...' : 'SAVE CREDENTIALS'}
            </Button>
          </form>

          <div 
            className="mt-6 p-4 rounded-lg border"
            style={{
              backgroundColor: 'var(--background-tertiary)',
              borderColor: 'var(--borders-subtle)'
            }}
          >
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--status-warning)' }}>
              ⚠️ SETELAH UPDATE
            </p>
            <ol className="text-xs space-y-1 list-decimal list-inside" style={{ color: 'var(--foreground-secondary)' }}>
              <li>Credentials akan tersimpan di backend</li>
              <li>Restart backend diperlukan</li>
              <li>Hapus session lama jika ada</li>
              <li>Setup Telegram lagi dengan credentials baru</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Current Status */}
      <div 
        className="mt-8 p-6 rounded-lg border"
        style={{
          backgroundColor: 'var(--background-secondary)',
          borderColor: 'var(--borders-default)'
        }}
      >
        <h3 
          className="text-xl font-bold mb-4"
          style={{ 
            fontFamily: 'Barlow Condensed, sans-serif',
            color: 'var(--foreground-primary)'
          }}
        >
          Current Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
              Current API ID
            </p>
            <p className="font-mono" style={{ color: 'var(--status-success)' }}>
              37983970
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--status-success)' }}>
              ✓ Credentials sudah benar
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--foreground-muted)' }}>
              Current API Hash
            </p>
            <p className="font-mono text-xs" style={{ color: 'var(--foreground-secondary)' }}>
              d484d8fe3d2f4025f99101caeb070e1a
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
              Perlu diverifikasi
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
