import type { Metadata } from "next";
import { H2, LegalDoc, Note, P, UL } from "@/components/legal-doc";
import { legalInfo } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service – ClipForge AI" };

export default function Terms() {
  const l = legalInfo();
  return (
    <LegalDoc title="Terms of Service" updated={l.updated}>
      <Note>
        These Terms are a legal agreement between you and {l.company}. Operators should have them reviewed by qualified counsel before launch.
      </Note>

      <H2>1. Acceptance</H2>
      <P>
        By creating an account or using ClipForge AI (the &quot;Service&quot;) you agree to these Terms, our{" "}
        <a className="underline" href="/privacy">Privacy Policy</a>, <a className="underline" href="/acceptable-use">Acceptable Use Policy</a> and{" "}
        <a className="underline" href="/copyright">Copyright Policy</a>. If you do not agree, do not use the Service. You must be at least 16 years old
        (or the age of digital consent in your country) and able to form a binding contract.
      </P>

      <H2>2. The Service</H2>
      <P>
        ClipForge AI transcribes video you provide, uses AI to suggest short clips (up to 60 seconds), and renders clips with burned-in captions. It is a tool:
        we do not publish content on your behalf. AI suggestions, transcripts and captions can contain errors, and you are responsible for reviewing them.
      </P>

      <H2>3. Your account</H2>
      <P>Sign-in is by emailed magic link. You are responsible for activity under your account and for keeping access to your email secure. Tell us promptly about any unauthorized use.</P>

      <H2>4. Your content and rights</H2>
      <UL>
        <li>You keep ownership of the videos and other material you provide (&quot;Your Content&quot;) and of the clips generated from them.</li>
        <li>You grant us a limited, non-exclusive licence to host, copy, process and transform Your Content solely to operate the Service for you, including sending it to our subprocessors.</li>
        <li><strong>You represent and warrant</strong> that you own Your Content or have all necessary permissions from rights holders to process and transform it, that doing so complies with applicable law and third-party terms (including YouTube&apos;s Terms of Service), and that it does not infringe or violate anyone&apos;s rights.</li>
        <li>The Service does not download videos from YouTube. A YouTube link only provides public metadata; to create clips you must supply a video file you are authorized to use.</li>
      </UL>

      <H2>5. Acceptable use</H2>
      <P>You must follow the <a className="underline" href="/acceptable-use">Acceptable Use Policy</a>. We may remove content or suspend accounts that violate it or that expose us or others to harm.</P>

      <H2>6. Third-party services</H2>
      <P>The Service relies on third parties (AI providers, email delivery, hosting). Their availability and terms are outside our control; see <a className="underline" href="/subprocessors">Subprocessors</a>.</P>

      <H2>7. Storage and deletion</H2>
      <P>Projects and files are retained for {l.retentionDays} days and then deleted automatically. You can delete content or your account at any time. Keep your own copies of anything you need – we do not provide backups of deleted content.</P>

      <H2>8. Fees</H2>
      <P>The Service is currently provided without charge unless we state otherwise. If paid plans are introduced, additional terms will be presented before you are charged.</P>

      <H2>9. Intellectual property</H2>
      <P>The Service, its software, branding and design are owned by {l.company} and its licensors. Except for Your Content, no rights are granted to you other than the right to use the Service under these Terms.</P>

      <H2>10. Copyright complaints</H2>
      <P>We respond to notices of alleged infringement under our <a className="underline" href="/copyright">Copyright Policy</a> and may terminate repeat infringers.</P>

      <H2>11. Disclaimers</H2>
      <P>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE, ACCURACY AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE OR THAT AI OUTPUT WILL BE ACCURATE OR SUITABLE FOR PUBLICATION.
        Some jurisdictions do not allow certain disclaimers, so parts of this section may not apply to you.
      </P>

      <H2>12. Limitation of liability</H2>
      <P>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, {l.company.toUpperCase()} WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR LOSS OF PROFITS, DATA OR
        GOODWILL, AND OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM AND USD 100.
        Nothing in these Terms limits liability that cannot be limited by law.
      </P>

      <H2>13. Indemnity</H2>
      <P>You will defend and indemnify {l.company} against claims, losses and expenses (including reasonable legal fees) arising from Your Content, your breach of these Terms, or your violation of law or third-party rights.</P>

      <H2>14. Suspension and termination</H2>
      <P>You may stop using the Service and delete your account at any time. We may suspend or terminate access if you breach these Terms, if required by law, or to protect the Service. Sections that by nature should survive (ownership, disclaimers, liability, indemnity) survive termination.</P>

      <H2>15. Changes</H2>
      <P>We may modify the Service or these Terms. For material changes we will give reasonable notice; continuing to use the Service afterwards means you accept the updated Terms.</P>

      <H2>16. Governing law and disputes</H2>
      <P>These Terms are governed by the laws of {l.jurisdiction}, without regard to conflict-of-law rules. Courts in that jurisdiction have exclusive jurisdiction, except where mandatory consumer law gives you the right to bring claims elsewhere.</P>

      <H2>17. Contact</H2>
      <P>
        <a className="underline" href={`mailto:${l.email}`}>{l.email}</a>
        {l.address ? ` · ${l.address}` : ""}
      </P>
    </LegalDoc>
  );
}
