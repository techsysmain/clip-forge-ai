import type { Metadata } from "next";
import { H2, LegalDoc, P, UL } from "@/components/legal-doc";
import { legalInfo } from "@/lib/legal";

export const metadata: Metadata = { title: "Cookies & Cache Policy – ClipForge AI" };

export default function Cookies() {
  const l = legalInfo();
  return (
    <LegalDoc title="Cookies & Cache Policy" updated={l.updated}>
      <P>This policy explains the cookies, browser storage and caching used by ClipForge AI.</P>

      <H2>1. Cookies we use</H2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/50">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Purpose</th>
              <th className="p-3">Type</th>
              <th className="p-3">Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="p-3 font-mono">cf_session</td>
              <td className="p-3">Keeps you signed in (signed token, httpOnly, SameSite=Lax, Secure over HTTPS).</td>
              <td className="p-3">Strictly necessary, first-party</td>
              <td className="p-3">Up to 14 days, or until you sign out</td>
            </tr>
          </tbody>
        </table>
      </div>
      <P>
        We do not use advertising, tracking or analytics cookies, so no cookie consent banner is shown. Strictly necessary cookies do not require consent under
        the ePrivacy rules; if we add non-essential cookies in future we will ask for your consent first.
      </P>

      <H2>2. Local storage</H2>
      <P>The app does not store personal data in localStorage or sessionStorage. Your browser may keep ordinary technical data (for example media buffers while previewing a video).</P>

      <H2>3. Caching</H2>
      <UL>
        <li><strong>Private data is not cached.</strong> API responses, video previews, downloads and signed-in pages are sent with <code>Cache-Control: no-store</code> / <code>private</code> so they are not kept by shared caches or proxies.</li>
        <li><strong>Static assets</strong> (scripts, styles, images, fonts) are cached by your browser and any CDN to make the app faster. They contain no personal data.</li>
        <li><strong>Public pages</strong> such as this policy may be cached.</li>
        <li><strong>Server-side temporary files</strong> created during processing are deleted when a job finishes; stored videos and clips are deleted per our <a className="underline" href="/privacy">retention schedule</a>.</li>
      </UL>

      <H2>4. Managing cookies and cache</H2>
      <P>
        You can block or delete cookies in your browser settings, but the Service will not work without the session cookie. Signing out removes it immediately. To clear
        cached files, use your browser&apos;s &quot;Clear browsing data&quot; option.
      </P>

      <H2>5. Third-party content</H2>
      <P>YouTube thumbnails shown for projects are loaded from YouTube/Google image servers (for example i.ytimg.com), which can receive your IP address and browser information when the image is requested.</P>

      <H2>6. Contact</H2>
      <P><a className="underline" href={`mailto:${l.privacyEmail}`}>{l.privacyEmail}</a></P>
    </LegalDoc>
  );
}
