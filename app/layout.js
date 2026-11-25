import './globals.css'
import AnalyticsTracker from '../components/AnalyticsTracker'

export const metadata = {
  title: 'Kenya MOH NTD-WASH Dashboard',
  description: 'Dashboard for monitoring NTD and WASH indicators in Kenya',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AnalyticsTracker />
        {children}
      </body>
    </html>
  )
}