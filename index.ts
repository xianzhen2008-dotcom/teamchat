export default {
  id: 'teamchat',
  name: 'TeamChat',
  description: 'Standalone multi-agent TeamChat web workspace.',
  async activate() {
    return {
      ok: true,
      message: 'TeamChat is a standalone web app. Run `npm start` to launch the server.'
    };
  }
};
