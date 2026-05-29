import { buildPlatform } from './factory'

const BINANCE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAIVBMVEVHcEzxuQjwuQvwuQvwuQrwuQrwuQvwuQrwuQrwuQvwuQs96DTAAAAACnRSTlMACex9etLZd7FlFauvgAAAATtJREFUWIWll9EagyAIRtHUyvd/4LXVDBQz/Lvbt85R0RCInp9lGbww4nOGDAcPGX48YLj4aUPhJw2MnzIIfsJQ8WZDwxsNCm8yqLzB0OFfG0KPzznYee+thop3zmioeSKboeVtBo23GHaVbwx7V+CiyleG6LoCoqjywhCfYnAbfDVMMQx4oqTyxZBG/DkHFj8Zye74wXMDGz/dQx6GyH6I3VzFpDfG80m7jcvyysbXl32FVJn2GZBiCHrgy5Y0hv+WBMG3hnIoos5fBnb+pYEdy6jzP4PIX9yQ+B9J578GULDYl+CqJeBBxLcRP0j4UZ74mMgLvp62/XO+HzShoCkNTKpwWocvFvhqwy9X/HrHC4zakMw8XmQ9GF7yXQNaqqLFMlquow0D2rKgTRPatqGNI9q6os0z2r6P+A/tMi2oe//ZPgAAAABJRU5ErkJggg==" width="16" height="16" preserveAspectRatio="xMidYMid meet"/></svg>'

export const Binance = buildPlatform({
	name: 'Binance',
	ccxtId: 'binance',
	homepage: 'https://www.binance.com',
	icon: BINANCE_ICON,
	simpleIcon: 'binance',
})
