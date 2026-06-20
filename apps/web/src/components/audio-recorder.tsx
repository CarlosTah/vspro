'use client';

import { useState, useRef } from 'react';

interface AudioRecorderProps {
  onRecorded: (blob: Blob) => void;
  disabled?: boolean;
}

export function AudioRecorder({ onRecorded, disabled }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        onRecorded(blob);
        stream.getTracks().forEach((t) => t.stop());
        setDuration(0);
      };

      recorder.start();
      mediaRecorder.current = recorder;
      setRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      alert('No se pudo acceder al micrófono. Verifica los permisos.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onMouseLeave={recording ? stopRecording : undefined}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      className={`px-3 py-2.5 rounded-lg transition-all disabled:opacity-50 ${
        recording
          ? 'bg-red-600 text-white animate-pulse scale-110'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
      title={recording ? `Grabando ${formatTime(duration)}...` : 'Mantener para grabar audio'}
    >
      {recording ? `⏺ ${formatTime(duration)}` : '🎤'}
    </button>
  );
}
