const tts = require('google-tts-api');

module.exports = async function handler(req, res) {
  // Header CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { text, vibe = 'ceria', gender = 'wanita', speed = 1.0 } = req.body || {};

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, error: 'Teks narasi wajib diisi.' });
    }

    let optimizedText = text;
    const apiKey = process.env.GEMINI_API_KEY;

    // 1. Minta Gemini mengoptimalkan gaya & dialek teks via Direct REST API
    if (apiKey) {
      try {
        const promptText = `Kamu adalah pakar fonetik dan pengarah vokal Bahasa Indonesia.
Tugasmu: Analisis teks input dan sesuaikan ekspresi, intonasi, tanda baca, serta jeda fonetis agar terdengar alami dengan logat Indonesia.
Aturan Vibe:
- ceria: Tambahkan tanda seru, intonasi naik dan dinamis.
- sedih: Perlambat tempo kata, tambahkan tanda titik/koma lebih banyak untuk efek jeda bernapas.
- puitis: Berikan penekanan kata, tempo sedang dengan jeda dramatis (...).
- misterius: Gunakan intonasi datar, jeda panjang, dan nada berat.

Karakter Suara: ${gender}
Target Vibe: ${vibe}

Kembalikan HANYA teks hasil optimasi tanpa komentar tambahan.
Teks Asli: ${text}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }]
            })
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const resultText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (resultText) {
            optimizedText = resultText.trim();
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini API Error (fallback ke teks asli):', geminiErr.message);
      }
    }

    // 2. Olah TTS Audio
    const isSlow = parseFloat(speed) < 0.9;
    const audioParts = await tts.getAllAudioBase64(optimizedText, {
      lang: 'id',
      slow: isSlow,
      host: 'https://translate.google.com',
      timeout: 15000,
      splitPunct: '.,?!;\n'
    });

    // 3. Gabungkan Chunk Audio
    const audioBuffers = audioParts.map((part) => Buffer.from(part.base64, 'base64'));
    const combinedBuffer = Buffer.concat(audioBuffers);
    const combinedBase64 = combinedBuffer.toString('base64');

    return res.status(200).json({
      success: true,
      vibe,
      gender,
      speed,
      processedText: optimizedText,
      audioUrl: `data:audio/mp3;base64,${combinedBase64}`,
      base64: combinedBase64
    });

  } catch (error) {
    console.error('Server execution error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Terjadi kesalahan internal pada server Vercel.'
    });
  }
};
