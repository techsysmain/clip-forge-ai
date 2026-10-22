import type { Metadata } from "next";
import { H2, LegalDoc, P } from "@/components/legal-doc";
import { legalInfo } from "@/lib/legal";

export const metadata: Metadata = { title: "Subprocessors – ClipForge AI" };

export default function Subprocessors() {
  const l = legalInfo();
  const rows = [
    {
      name: "OpenAI",
      purpose: "Speech-to-text transcription and AI clip analysis (when OpenAI is the configured provider)",
      data: "Extracted audio, transcript text, video title",
      link: "https://openai.com/policies",
    },
    {
      name: "Google (Gemini API)",
      purpose: "Speech-to-text transcription and AI clip analysis (when Gemini is the configured provider)",
      data: "Extracted audio, transcript text, video title",
      link: "https://ai.google.dev/gemini-api/terms",
    },
    {
      name: "Resend",
      purpose: "Transactional email delivery (sign-in links and notifications)",
      data: "Email address, email content",
      link: "https://resend.com/legal/privacy-policy",
    },
    {
      name: "YouTube / Google",
      purpose: "Public video metadata and thumbnails (no media is downloaded)",
      data: "Video ID, IP address of the requester",
      link: "https://policies.google.com/privacy",
    },
    {
      name: "Hosting & database provider",
      purpose: "Hosting of the web app, worker, MySQL database and file storage",
      data: "All account and project data",
      link: "",
    },
  ];
  return (
    <LegalDoc title="Subprocessors" updated={l.updated}>
      <P>
        We use the following third parties to deliver the Service. Only the provider configured by the operator ({l.aiProvider === "gemini" ? "Google Gemini" : "OpenAI"} is
        currently active for AI processing) receives your media-derived data. We will update this list when providers change.
      </P>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/50">
            <tr>
              <th className="p-3">Provider</th>
              <th className="p-3">Purpose</th>
              <th className="p-3">Data shared</th>
              <th className="p-3">Terms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-border align-top">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3">{r.purpose}</td>
                <td className="p-3">{r.data}</td>
                <td className="p-3">
                  {r.link ? (
                    <a className="underline" href={r.link} target="_blank" rel="noreferrer noopener">
                      Policy
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <H2>Questions</H2>
      <P>Contact <a className="underline" href={`mailto:${l.privacyEmail}`}>{l.privacyEmail}</a>.</P>
    </LegalDoc>
  );
}
