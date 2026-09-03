import { createApp } from "@my/core/app"
import { createTui } from "@my/tui"

export const tui = async () => {
  const controller = createTui()
  const app = await createApp({ ask: controller.ask })
  await controller.run(app)
}
