import WebsiteHeader from "./WebsiteHeader";
import WebsiteFooter from "./WebsiteFooter";

export default function WebsiteLayout({ children }) {
  return (
    <div className="site">
      <WebsiteHeader />
      <main className="site-main">{children}</main>
      <WebsiteFooter />
    </div>
  );
}
