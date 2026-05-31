import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Mic, Send, Sparkles, Square } from "lucide-react";
import { createPhotoCapture, createTextCapture, createVoiceCapture } from "../../data";

export function CapturePanel({ userId }: { userId: string }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!savedMessage) return;
    const timer = window.setTimeout(() => setSavedMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [savedMessage]);

  async function saveCapture() {
    if (!text.trim() && !file) return;
    setIsSaving(true);
    try {
      if (file) {
        await createPhotoCapture(userId, file, text.trim());
      } else {
        await createTextCapture(userId, text.trim());
      }
      setText("");
      setFile(null);
      setSavedMessage(navigator.onLine ? "Captured" : "Captured offline — will sync");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;
        setIsSaving(true);
        try {
          await createVoiceCapture(userId, blob, text.trim());
          setText("");
          setSavedMessage(navigator.onLine ? "Voice captured" : "Voice saved offline — will sync");
        } finally {
          setIsSaving(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setSavedMessage("Microphone access denied");
    }
  }

  return (
    <div className="stack capture-stack">
      {savedMessage && <div className="sync-toast">{savedMessage}</div>}
      <section className="capture-card">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Dump the thought. No sorting. No polishing."
          rows={8}
        />
        {file && <p className="file-pill">{file.name}</p>}
        {isRecording && <p className="recording-pill">Recording… tap stop when done</p>}
        <div className="capture-actions">
          <label className="tool-button">
            <Camera size={20} />
            <span>Photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            className={isRecording ? "tool-button recording" : "tool-button"}
            onClick={toggleRecording}
            disabled={isSaving}
          >
            {isRecording ? <Square size={20} /> : <Mic size={20} />}
            <span>{isRecording ? "Stop" : "Voice"}</span>
          </button>
          <button
            className="send-button"
            onClick={saveCapture}
            disabled={isSaving || isRecording || (!text.trim() && !file)}
          >
            {isSaving ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
            <span>Capture</span>
          </button>
        </div>
      </section>
      <section className="quiet-note">
        <Sparkles size={18} />
        <p>Everything lands in review first. Photos and voice sync when you are back online.</p>
      </section>
    </div>
  );
}
