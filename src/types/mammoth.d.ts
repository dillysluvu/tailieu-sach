declare module 'mammoth/mammoth.browser' {
  interface ConvertToHtmlOptions {
    arrayBuffer: ArrayBuffer
  }

  interface ConvertResult {
    value: string
    messages: Array<{ type: string; message: string }>
  }

  function convertToHtml(options: ConvertToHtmlOptions): Promise<ConvertResult>

  const mammoth: { convertToHtml: typeof convertToHtml }
  export default mammoth
}
