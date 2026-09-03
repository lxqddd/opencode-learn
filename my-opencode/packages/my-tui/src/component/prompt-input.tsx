export function PromptInput(props: { visible: () => boolean; onSubmit: (text: string) => void }) {
  let el: any = null
  return (
    <>
      {props.visible() && (
        <input
          ref={(node) => (el = node)}
          placeholder="you> 输入问题,回车发送"
          onSubmit={() => {
            const text = (el?.text ?? "") as string
            if (!text.trim()) return
            el.setText("")
            props.onSubmit(text)
          }}
        />
      )}
    </>
  )
}
