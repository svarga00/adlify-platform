/**
 * ADLIFY - Email Templates
 * Onboarding Complete Email
 */

const EmailTemplates = {
    
    /**
     * Email po dokončení onboardingu
     * @param {Object} data - Dáta z onboardingu
     */
    onboardingComplete(data) {
        const {
            contact_person,
            company_name,
            selected_package,
            selected_platforms = [],
            has_existing_accounts,
            can_add_tracking_codes,
            website_manager
        } = data;
        
        const packageInfo = this.PACKAGES[selected_package] || this.PACKAGES.pro;
        const platformsHtml = this.getPlatformsHtml(selected_platforms);
        const nextStepsHtml = this.getNextStepsHtml(data);
        
        return {
            subject: `🎉 Vitajte v Adlify, ${contact_person}! Tu sú vaše ďalšie kroky`,
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vitajte v Adlify</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
        .header { background: linear-gradient(135deg, #FF6B35 0%, #E91E63 50%, #9C27B0 100%); padding: 40px 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; }
        .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px; }
        .content { padding: 30px; }
        .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
        .section { margin: 25px 0; padding: 20px; background: #f8f9fa; border-radius: 12px; }
        .section-title { font-size: 16px; font-weight: 600; color: #333; margin: 0 0 15px; display: flex; align-items: center; gap: 10px; }
        .section-title span { font-size: 24px; }
        .package-card { background: linear-gradient(135deg, ${packageInfo.color} 0%, ${packageInfo.colorEnd || packageInfo.color} 100%); color: white; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px; }
        .package-name { font-size: 24px; font-weight: 700; margin: 0; }
        .package-price { font-size: 32px; font-weight: 800; margin: 10px 0 5px; }
        .package-price small { font-size: 14px; font-weight: 400; opacity: 0.9; }
        .platforms-grid { display: flex; flex-wrap: wrap; gap: 10px; }
        .platform-badge { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: white; border-radius: 8px; font-size: 14px; color: #333; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .steps-list { list-style: none; padding: 0; margin: 0; }
        .steps-list li { display: flex; gap: 15px; padding: 15px 0; border-bottom: 1px solid #e9ecef; }
        .steps-list li:last-child { border-bottom: none; }
        .step-number { width: 28px; height: 28px; background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
        .step-content { flex: 1; }
        .step-title { font-weight: 600; color: #333; margin: 0 0 4px; }
        .step-desc { font-size: 14px; color: #666; margin: 0; }
        .btn { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #FF6B35, #E91E63); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 10px 5px; }
        .btn-secondary { background: #f1f3f4; color: #333; }
        .cta-section { text-align: center; padding: 20px 0; }
        .help-box { background: #e8f5e9; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .help-box h4 { color: #2e7d32; margin: 0 0 10px; }
        .help-box p { color: #388e3c; margin: 0; font-size: 14px; }
        .footer { background: #1e1e2f; color: #aaa; padding: 30px; text-align: center; font-size: 13px; }
        .footer a { color: #FF6B35; text-decoration: none; }
        .social-links { margin: 15px 0; }
        .social-links a { display: inline-block; margin: 0 10px; color: #aaa; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <h1>🎉 Vitajte v Adlify!</h1>
            <p>Vaša cesta k úspešnej online reklame začína</p>
        </div>
        
        <!-- Content -->
        <div class="content">
            <p class="greeting">
                Ahoj <strong>${contact_person}</strong>,<br><br>
                Ďakujeme za vyplnenie onboarding dotazníka pre <strong>${company_name}</strong>! 
                Sme nadšení, že môžeme spolupracovať na vašom online marketingu.
            </p>
            
            <!-- Vybraný balík -->
            <div class="package-card">
                <p style="margin: 0 0 5px; opacity: 0.9; font-size: 14px;">Váš balík</p>
                <p class="package-name">${packageInfo.icon} ${packageInfo.name}</p>
                <p class="package-price">${packageInfo.price}€ <small>/mesačne</small></p>
            </div>
            
            <!-- Vybrané platformy -->
            <div class="section">
                <h3 class="section-title"><span>📱</span> Vaše reklamné platformy</h3>
                <div class="platforms-grid">
                    ${platformsHtml}
                </div>
            </div>
            
            <!-- Ďalšie kroky -->
            <div class="section">
                <h3 class="section-title"><span>📋</span> Vaše ďalšie kroky</h3>
                <ol class="steps-list">
                    ${nextStepsHtml}
                </ol>
            </div>
            
            <!-- CTA -->
            <div class="cta-section">
                <a href="https://app.adlify.eu/portal" class="btn">Prejsť do portálu</a>
                <a href="https://adlify.eu/navody" class="btn btn-secondary">Návody a pomoc</a>
            </div>
            
            <!-- Help box -->
            <div class="help-box">
                <h4>💬 Potrebujete pomoc?</h4>
                <p>
                    Náš tím je tu pre vás! Napíšte nám na <a href="mailto:podpora@adlify.eu" style="color: #2e7d32; font-weight: 600;">podpora@adlify.eu</a> 
                    alebo zavolajte na <strong>+421 XXX XXX XXX</strong>.
                </p>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div style="margin-bottom: 15px;">
                <img src="https://adlify.eu/logo-white.png" alt="Adlify" style="height: 30px;" onerror="this.style.display='none'">
            </div>
            <div class="social-links">
                <a href="https://facebook.com/adlify">Facebook</a>
                <a href="https://instagram.com/adlify">Instagram</a>
                <a href="https://linkedin.com/company/adlify">LinkedIn</a>
            </div>
            <p style="margin: 15px 0 0;">
                © ${new Date().getFullYear()} Adlify s.r.o. | <a href="https://adlify.eu">adlify.eu</a>
            </p>
            <p style="margin: 10px 0 0; font-size: 11px; color: #666;">
                Tento email ste dostali, pretože ste vyplnili onboarding dotazník na adlify.eu
            </p>
        </div>
    </div>
</body>
</html>
            `,
            text: this.getPlainTextVersion(data, packageInfo)
        };
    },
    
    /**
     * Package definitions
     */
    PACKAGES: {
        starter: { name: 'Starter', price: 149, icon: '🚀', color: '#3B82F6' },
        pro: { name: 'Pro', price: 249, icon: '⭐', color: '#F97316', colorEnd: '#EC4899' },
        enterprise: { name: 'Enterprise', price: 399, icon: '💎', color: '#8B5CF6' },
        premium: { name: 'Premium', price: 799, icon: '👑', color: '#F59E0B', colorEnd: '#D97706' }
    },
    
    /**
     * Platform definitions
     */
    PLATFORMS: {
        google_ads: { name: 'Google Ads', icon: '🔍' },
        meta_ads: { name: 'Meta (FB/IG)', icon: '📘' },
        linkedin_ads: { name: 'LinkedIn', icon: '💼' },
        tiktok_ads: { name: 'TikTok', icon: '🎵' }
    },
    
    /**
     * Generate platforms HTML
     */
    getPlatformsHtml(platforms) {
        return platforms.map(p => {
            const platform = this.PLATFORMS[p] || { name: p, icon: '📱' };
            return `<span class="platform-badge">${platform.icon} ${platform.name}</span>`;
        }).join('');
    },
    
    /**
     * Generate next steps based on user answers
     */
    getNextStepsHtml(data) {
        const steps = [];
        
        // Step 1: Always - check portal
        steps.push({
            title: 'Prihláste sa do klientského portálu',
            desc: 'Tu nájdete prehľad vašich kampaní, reporty a môžete schvaľovať návrhy.'
        });
        
        // Step 2: Based on existing accounts
        if (data.has_existing_accounts === 'no' || data.has_existing_accounts === 'unknown') {
            steps.push({
                title: 'Vytvorte si reklamné účty',
                desc: 'Poslali sme vám návody na vytvorenie účtov. Alebo to spravíme za vás - stačí nám dať vedieť.'
            });
        } else if (data.has_existing_accounts === 'some') {
            steps.push({
                title: 'Skontrolujte existujúce účty',
                desc: 'Uistite sa, že máte prístup ku všetkým potrebným účtom. Chýbajúce vám pomôžeme vytvoriť.'
            });
        } else {
            steps.push({
                title: 'Udeľte nám prístup k účtom',
                desc: 'V portáli nájdete návod ako nám udeliť správcovský prístup k vašim reklamným účtom.'
            });
        }
        
        // Step 3: Based on tracking codes ability
        if (data.can_add_tracking_codes === 'no' || data.can_add_tracking_codes === 'help') {
            steps.push({
                title: 'Dohodneme inštaláciu sledovacích kódov',
                desc: 'Náš technik vás bude kontaktovať ohľadom inštalácie pixelov a konverzného sledovania.'
            });
        } else if (data.can_add_tracking_codes === 'gtm') {
            steps.push({
                title: 'Poskytnite prístup do GTM',
                desc: 'Udeľte nám prístup do Google Tag Manager a my sa o všetko postaráme.'
            });
        }
        
        // Step 4: Úvodný call
        steps.push({
            title: 'Úvodný strategický hovor',
            desc: 'V priebehu 48 hodín vás budeme kontaktovať pre dohodnutie úvodného stretnutia.'
        });
        
        return steps.map((step, i) => `
            <li>
                <span class="step-number">${i + 1}</span>
                <div class="step-content">
                    <p class="step-title">${step.title}</p>
                    <p class="step-desc">${step.desc}</p>
                </div>
            </li>
        `).join('');
    },
    
    /**
     * Plain text version
     */
    getPlainTextVersion(data, packageInfo) {
        const platforms = (data.selected_platforms || [])
            .map(p => this.PLATFORMS[p]?.name || p)
            .join(', ');
            
        return `
Vitajte v Adlify!

Ahoj ${data.contact_person},

Ďakujeme za vyplnenie onboarding dotazníka pre ${data.company_name}!

VÁŠ BALÍK: ${packageInfo.name} - ${packageInfo.price}€/mesačne

VAŠE PLATFORMY: ${platforms}

ĎALŠIE KROKY:
1. Prihláste sa do portálu: https://app.adlify.eu/portal
2. Vytvorte/prepojte reklamné účty
3. V priebehu 48h vás budeme kontaktovať

Potrebujete pomoc?
Email: podpora@adlify.eu
Web: https://adlify.eu

© ${new Date().getFullYear()} Adlify s.r.o.
        `.trim();
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmailTemplates;
} else {
    window.EmailTemplates = EmailTemplates;
}
