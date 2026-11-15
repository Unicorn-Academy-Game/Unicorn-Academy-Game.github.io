import { boot } from './boot/boot';
import { AssetError } from './game/assets';
import { Ui } from './ui/ui';

const ui = new Ui(document.getElementById('ui')!);
boot(ui).catch((error: unknown) => {
  console.error(error);
  const message =
    error instanceof AssetError
      ? 'Part of the game is not on this device yet. Connect to the internet and try again.'
      : 'Something went wrong while waking up the unicorns.';
  ui.failed(message, () => location.reload());
});
