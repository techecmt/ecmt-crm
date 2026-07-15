import { WebsiteWidgetClient } from "@/components/website-widget/widget-client";

export const metadata = {
  title: "Admissions Assistant",
  robots: { index: false, follow: false },
};

export default function WebsiteWidgetPage() {
  return <WebsiteWidgetClient />;
}
