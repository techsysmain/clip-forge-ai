import type { Metadata } from "next";
import { H2, LegalDoc, P, UL } from "@/components/legal-doc";
import { legalInfo } from "@/lib/legal";

export const metadata: Metadata = { title: "Acceptable Use Policy – ClipForge AI" };

export default function AcceptableUse() {
  const l = legalInfo();
  return (
    <LegalDoc title="Acceptable Use Policy" updated={l.updated}>
      <P>This policy applies to everyone who uses ClipForge AI and forms part of our <a className="underline" href="/terms">Terms of Service</a>.</P>

      <H2>1. Only process media you have rights to</H2>
      <UL>
        <li>Upload or link only videos you own or are explicitly licensed or authorized to copy, edit, and republish in clip form.</li>
        <li>Do not use the Service to circumvent access controls, paywalls, DRM, or the terms of any platform (including YouTube). Do not use the Service to obtain or redistribute content you are not entitled to.</li>
        <li>Respect fair-use and licence limits; you are responsible for any legal analysis relating to your use.</li>
      </UL>

      <H2>2. Prohibited content</H2>
      <UL>
        <li>Child sexual abuse material or any sexualization of minors – reported to authorities.</li>
        <li>Content that promotes terrorism, violence, human trafficking or self-harm, or that incites hatred or harassment.</li>
        <li>Non-consensual intimate imagery, doxxing, or content that violates someone&apos;s privacy or publicity rights.</li>
        <li>Deceptive deepfakes, fraud, phishing, malware, or misinformation intended to cause harm.</li>
        <li>Content that is unlawful or infringes intellectual property rights.</li>
      </UL>

      <H2>3. Prohibited conduct</H2>
      <UL>
        <li>Attempting to access other users&apos; data, probe or attack the Service, or bypass rate limits, upload limits or security controls.</li>
        <li>Submitting URLs designed to reach internal networks or services (SSRF) or to cause the Service to attack third parties.</li>
        <li>Automated bulk abuse, reselling the Service without permission, or using it to build a competing service through scraping.</li>
        <li>Submitting prompts or media designed to manipulate the AI into harmful behaviour or to extract system information.</li>
        <li>Creating accounts using someone else&apos;s email address.</li>
      </UL>

      <H2>4. Enforcement</H2>
      <P>We may remove content, delete projects, limit usage, or suspend/terminate accounts that violate this policy, and may report unlawful activity to authorities. We will try to notify you unless the law or safety prevents it.</P>

      <H2>5. Reporting</H2>
      <P>Report abuse to <a className="underline" href={`mailto:${l.email}`}>{l.email}</a>. For copyright complaints use our <a className="underline" href="/copyright">Copyright Policy</a>.</P>
    </LegalDoc>
  );
}
