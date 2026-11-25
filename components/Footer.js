import { ExternalLink } from 'lucide-react';

export default function Footer() {
  const partners = [
    { name: 'Wash Alliance', url: '#', logo: '/wash-alliance.png' },
    { name: 'Clinton', url: '#', logo: '/clinton.png' },
    { name: 'The End Fund', url: '#', logo: '/endfund.png' },
  ];

  return (
    <footer className="bg-white border-t border-gray-200 mt-4">
      <div className="max-w-7xl mx-auto px-6 py-4">
        {/* Partners Section */}
        <div className="mb-4 pb-4 border-b border-gray-100">
          <div className="flex flex-col md:flex-row items-center justify-center md:gap-4">
            <h4 className="text-lg font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap mr-2 mb-2 md:mb-0">
              Partners
            </h4>
            <div className="hidden md:block w-px bg-gray-400" style={{ height: '20px' }}></div>
            <div className="flex items-center flex-wrap justify-center" style={{ gap: '24px' }}>
              {partners.map((partner, index) => (
                <div key={index} className="flex items-center">
                  <a
                    href={partner.url}
                    className="group"
                    target="_blank"
                    rel="noopener noreferrer"
                    title={partner.name}
                  >
                    {partner.logo ? (
                      <img 
                        src={partner.logo} 
                        alt={`${partner.name} logo`} 
                        className="w-auto object-contain opacity-60 hover:opacity-100 transition-opacity duration-300"
                        style={{ height: '17px' }}
                      />
                    ) : (
                      <div className="px-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded flex items-center justify-center" style={{ height: '17px' }}>
                        <span className="text-white text-xs font-bold">
                          {partner.name.split(' ').map(word => word[0]).join('').substring(0, 2)}
                        </span>
                      </div>
                    )}
                  </a>
                  {/* Add vertical divider after each logo except the last one */}
                  {index < partners.length - 1 && (
                    <div className="hidden md:block w-px bg-gray-300 mx-3" style={{ height: '15px' }}></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-3">
            {/* Copyright */}
            <div className="text-sm text-gray-500 text-center lg:text-right">
              © {new Date().getFullYear()} Kenya Ministry of Health. All rights reserved.
            </div>
            <a
              href="/analytics"
              className="text-sm text-gray-500 hover:text-blue-700 underline-offset-2 hover:underline"
            >
              Visitor Analytics
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}