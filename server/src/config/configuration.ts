export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    username: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'photo_stars',
  },
  jwt: { secret: process.env.JWT_SECRET ?? 'dev-secret', expiresIn: '7d' },
  qq: { appId: process.env.QQ_APP_ID ?? '', appKey: process.env.QQ_APP_KEY ?? '', redirectUri: process.env.QQ_REDIRECT_URI ?? '' },
});
