const { MsEdgeTTS, OUTPUT_FORMAT } = require('ms-edge-tts');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const { text, vibe = 'ceria', gender = 'wanita', speed = 1.0 } = req.body || {};

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, error: 'Teks narasi wajib diisi.' });
    }

    let optimizedText = text;
    const apiKey = process.env.GEMINI_API_KEY;

    // 1. Gemini merapikan teks & tanda baca sesuai Vibe
    if (apiKey) {
      try {
        const promptText = `Kamu adalah pengarah vokal Bahasa Indonesia.
Ubah teks input berikut agar mengekspresikan vibe "${vibe}".
Tambahkan tanda baca (titik, koma, tanda seru, titik-titik untuk jeda) agar pembacaan audio pas.
Aturan Vibe:
- ceria: nada dinamis, gunakan tanda seru (!).
- sedih: lambat, melankolis, gunakan banyak titik/koma untuk jeda napas.
- puitis: estetis, gunakan jeda titik-titik (...).
- misterius: berat, datar, gunakan jeda panjang.

Kembalikan HANYA teks hasil optimasi tanpa komentar tambahan.
Teks Asli: ${text}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const resultText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (resultText) optimizedText = resultText.trim();
        }
      } catch (e) {
        console.warn('Gemini fallback:', e.message);
      }
    }

    // 2. Pemilihan Suara (Pria / Wanita)
    const voice = gender === 'pria' ? 'id-ID-ArdiNeural' : 'id-ID-GadisNeural';

    // 3. Penyesuaian Pitch Berdasarkan Vibe
    let pitch = '+0Hz';
    if (vibe === 'misterius') pitch = '-10Hz';
    if (vibe === 'ceria') pitch = '+6Hz';
    if (vibe === 'sedih') pitch = '-4Hz';

    const speedPercent = Math.round((parseFloat(speed) - 1) * 100);
    const rate = `${speedPercent >= 0 ? '+' : ''}${speedPercent}%`;

    // 4. Synthesize Audio Menggunakan ms-edge-tts
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const stream = tts.toStream(optimizedText, { rate, pitch });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);
    const base64Audio = audioBuffer.toString('base64');

    return res.status(200).json({
      success: true,
      vibe,
      gender,
      speed,
      processedText: optimizedText,
      audioUrl: `data:audio/mp3;base64,${base64Audio}`,
      base64: base64Audio
    });

  } catch (error) {
    console.error('TTS Generation Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Gagal memproses audio.'
    });
  }
};
