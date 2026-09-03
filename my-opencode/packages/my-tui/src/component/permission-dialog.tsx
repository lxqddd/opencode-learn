export function PermissionDialog(props: {
  visible: () => boolean
  permission: { tool: string; resource: string } | null
}) {
  return (
    <>
      {props.visible() && props.permission && (
        <box borderStyle="single" flexDirection="column">
          <text content={` permission: ${props.permission.tool ?? ""}`} />
          <text content={` ${(props.permission.resource ?? "").slice(0, 200)}`} />
          <text content=" [y] allow once   [a] always allow   [n] deny" />
        </box>
      )}
    </>
  )
}
